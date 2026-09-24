package kubernetes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/sre-agent/sandbox-controller/internal/application"
	"github.com/sre-agent/sandbox-controller/internal/domain"
)

var (
	_ application.SandboxProvisioner = (*JobProvisionerV1)(nil)
	_ application.ReadinessProbe     = (*JobProvisionerV1)(nil)
)

type JobProvisionerV1 struct {
	client       kubernetes.Interface
	namespace    string
	runtimeClass string
	sourceToken  string
}

func NewJobProvisionerV1(client kubernetes.Interface, namespace, runtimeClass, sourceToken string) *JobProvisionerV1 {
	return &JobProvisionerV1{client: client, namespace: namespace, runtimeClass: runtimeClass, sourceToken: sourceToken}
}

func (runner *JobProvisionerV1) Ready(ctx context.Context) error {
	_, err := runner.client.Discovery().ServerVersion()
	return err
}

func (runner *JobProvisionerV1) Provision(ctx context.Context, input domain.ProvisionSandboxInput) (domain.Sandbox, error) {
	activeDeadlineSeconds := int64((15 * time.Minute).Seconds())
	ttlSecondsAfterFinished := int32(300)
	backoffLimit := int32(0)
	runAsUser := int64(65532)
	runAsGroup := int64(65532)
	runAsNonRoot := true
	readOnlyRootFilesystem := true
	allowPrivilegeEscalation := false
	runtimeClass := runner.runtimeClass

	jobName := sandboxName(input.RepairRunID)
	task, err := json.Marshal(map[string]any{
		"sourceArchiveUrl":    input.SourceArchiveURL,
		"expectedCommit":      input.ExpectedCommit,
		"changes":             input.Changes,
		"verificationProfile": input.VerificationProfile,
	})
	if err != nil {
		return domain.Sandbox{}, err
	}
	taskHash := sha256.Sum256(task)
	taskHashHex := hex.EncodeToString(taskHash[:])
	secret := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{
		Name: jobName, Namespace: runner.namespace,
		Labels:      map[string]string{"app.kubernetes.io/managed-by": "sandbox-controller", "sre-agent.io/repair-run-id": input.RepairRunID},
		Annotations: map[string]string{"sre-agent.io/task-sha256": taskHashHex},
	}, StringData: map[string]string{"task.json": string(task), "source-token": runner.sourceToken}}
	createdSecret, secretErr := runner.client.CoreV1().Secrets(runner.namespace).Create(ctx, secret, metav1.CreateOptions{})
	if apierrors.IsAlreadyExists(secretErr) {
		createdSecret, secretErr = runner.client.CoreV1().Secrets(runner.namespace).Get(ctx, jobName, metav1.GetOptions{})
		if secretErr == nil && createdSecret.Annotations["sre-agent.io/task-sha256"] != taskHashHex {
			return domain.Sandbox{}, application.ErrSandboxConflict
		}
	}
	if secretErr != nil {
		return domain.Sandbox{}, secretErr
	}
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: runner.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       "repair-sandbox",
				"app.kubernetes.io/managed-by": "sandbox-controller",
				"sre-agent.io/repair-run-id":   input.RepairRunID,
				"sre-agent.io/toolchain":       input.Toolchain,
			},
			Annotations: map[string]string{"sre-agent.io/task-sha256": taskHashHex},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoffLimit,
			ActiveDeadlineSeconds:   &activeDeadlineSeconds,
			TTLSecondsAfterFinished: &ttlSecondsAfterFinished,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{
					"app.kubernetes.io/name":     "repair-sandbox",
					"sre-agent.io/repair-run-id": input.RepairRunID,
				}},
				Spec: corev1.PodSpec{
					AutomountServiceAccountToken: boolPointer(false),
					EnableServiceLinks:           boolPointer(false),
					RestartPolicy:                corev1.RestartPolicyNever,
					RuntimeClassName:             &runtimeClass,
					SecurityContext: &corev1.PodSecurityContext{
						RunAsUser:    &runAsUser,
						RunAsGroup:   &runAsGroup,
						RunAsNonRoot: &runAsNonRoot,
						FSGroup:      &runAsGroup,
						SeccompProfile: &corev1.SeccompProfile{
							Type: corev1.SeccompProfileTypeRuntimeDefault,
						},
					},
					Containers: []corev1.Container{{
						Name:       "repair",
						Image:      input.Image,
						Command:    []string{"/sandbox-executor", "--task", "/var/run/sre-agent/task.json", "--workspace", "/workspace"},
						WorkingDir: "/workspace",
						Env: []corev1.EnvVar{
							{Name: "SOURCE_AUTH_TOKEN", ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: jobName}, Key: "source-token"}}},
							{Name: "HOME", Value: "/workspace/.home"},
							{Name: "COREPACK_HOME", Value: "/workspace/.corepack"},
							{Name: "PNPM_HOME", Value: "/workspace/.pnpm"},
							{Name: "GOCACHE", Value: "/workspace/.gocache"},
							{Name: "GOMODCACHE", Value: "/workspace/.gomodcache"},
							{Name: "TMPDIR", Value: "/tmp"},
						},
						SecurityContext: &corev1.SecurityContext{
							AllowPrivilegeEscalation: &allowPrivilegeEscalation,
							ReadOnlyRootFilesystem:   &readOnlyRootFilesystem,
							Capabilities: &corev1.Capabilities{
								Drop: []corev1.Capability{"ALL"},
							},
						},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("250m"),
								corev1.ResourceMemory: resource.MustParse("256Mi"),
							},
							Limits: corev1.ResourceList{
								corev1.ResourceCPU:              resource.MustParse("2"),
								corev1.ResourceMemory:           resource.MustParse("2Gi"),
								corev1.ResourceEphemeralStorage: resource.MustParse("4Gi"),
							},
						},
						VolumeMounts: []corev1.VolumeMount{{Name: "workspace", MountPath: "/workspace"}, {Name: "task", MountPath: "/var/run/sre-agent", ReadOnly: true}, {Name: "scratch", MountPath: "/tmp"}},
					}},
					Volumes: []corev1.Volume{{
						Name: "workspace",
						VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{
							SizeLimit: resourcePointer(resource.MustParse("4Gi")),
						}},
					}, {Name: "task", VolumeSource: corev1.VolumeSource{Secret: &corev1.SecretVolumeSource{SecretName: jobName}}}, {Name: "scratch", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{SizeLimit: resourcePointer(resource.MustParse("1Gi"))}}}},
				},
			},
		},
	}

	created, err := runner.client.BatchV1().Jobs(runner.namespace).Create(ctx, job, metav1.CreateOptions{})
	if apierrors.IsAlreadyExists(err) {
		created, err = runner.client.BatchV1().Jobs(runner.namespace).Get(ctx, jobName, metav1.GetOptions{})
	}
	if err != nil {
		if !apierrors.IsAlreadyExists(err) {
			_ = runner.client.CoreV1().Secrets(runner.namespace).Delete(ctx, jobName, metav1.DeleteOptions{})
		}
		return domain.Sandbox{}, err
	}
	if created.Annotations["sre-agent.io/task-sha256"] != taskHashHex {
		return domain.Sandbox{}, application.ErrSandboxConflict
	}
	return sandboxFromJob(created), nil
}

func (runner *JobProvisionerV1) Get(ctx context.Context, repairRunID string) (domain.Sandbox, error) {
	job, err := runner.client.BatchV1().Jobs(runner.namespace).Get(ctx, sandboxName(repairRunID), metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return domain.Sandbox{}, application.ErrSandboxNotFound
	}
	if err != nil {
		return domain.Sandbox{}, err
	}
	return sandboxFromJob(job), nil
}

func (runner *JobProvisionerV1) Result(ctx context.Context, repairRunID string) (domain.SandboxExecutionResult, error) {
	job, err := runner.client.BatchV1().Jobs(runner.namespace).Get(ctx, sandboxName(repairRunID), metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return domain.SandboxExecutionResult{}, application.ErrSandboxNotFound
	}
	if err != nil {
		return domain.SandboxExecutionResult{}, err
	}
	if job.Status.Succeeded == 0 && job.Status.Failed == 0 {
		return domain.SandboxExecutionResult{}, application.ErrSandboxNotComplete
	}
	pods, err := runner.client.CoreV1().Pods(runner.namespace).List(ctx, metav1.ListOptions{LabelSelector: "job-name=" + job.Name})
	if err != nil {
		return domain.SandboxExecutionResult{}, err
	}
	if len(pods.Items) == 0 {
		return domain.SandboxExecutionResult{}, application.ErrSandboxResultInvalid
	}
	limit := int64(1 << 20)
	stream, err := runner.client.CoreV1().Pods(runner.namespace).GetLogs(pods.Items[0].Name, &corev1.PodLogOptions{Container: "repair", LimitBytes: &limit}).Stream(ctx)
	if err != nil {
		return domain.SandboxExecutionResult{}, err
	}
	defer stream.Close()
	payload, err := io.ReadAll(io.LimitReader(stream, limit+1))
	if err != nil || len(payload) > int(limit) {
		return domain.SandboxExecutionResult{}, application.ErrSandboxResultInvalid
	}
	const marker = "SRE_AGENT_RESULT="
	index := strings.LastIndex(string(payload), marker)
	if index < 0 {
		return domain.SandboxExecutionResult{}, application.ErrSandboxResultInvalid
	}
	line := strings.SplitN(string(payload[index+len(marker):]), "\n", 2)[0]
	var result domain.SandboxExecutionResult
	if err = json.Unmarshal([]byte(line), &result); err != nil || result.Status == "" {
		return domain.SandboxExecutionResult{}, fmt.Errorf("%w: %v", application.ErrSandboxResultInvalid, err)
	}
	return result, nil
}

func (runner *JobProvisionerV1) Delete(ctx context.Context, repairRunID string) error {
	policy := metav1.DeletePropagationBackground
	err := runner.client.BatchV1().Jobs(runner.namespace).Delete(ctx, sandboxName(repairRunID), metav1.DeleteOptions{PropagationPolicy: &policy})
	if err != nil && !apierrors.IsNotFound(err) {
		return err
	}
	secretErr := runner.client.CoreV1().Secrets(runner.namespace).Delete(ctx, sandboxName(repairRunID), metav1.DeleteOptions{})
	if secretErr != nil && !apierrors.IsNotFound(secretErr) {
		return errors.Join(err, secretErr)
	}
	return nil
}

func sandboxName(repairRunID string) string {
	normalized := "repair-" + repairRunID
	if len(normalized) <= 63 {
		return normalized
	}
	sum := sha256.Sum256([]byte(repairRunID))
	suffix := hex.EncodeToString(sum[:4])
	return normalized[:54] + "-" + suffix
}

func sandboxFromJob(job *batchv1.Job) domain.Sandbox {
	status, reason := "created", ""
	if job.Status.Active > 0 {
		status = "running"
	}
	if job.Status.Succeeded > 0 {
		status = "succeeded"
	}
	if job.Status.Failed > 0 {
		status = "failed"
	}
	for _, condition := range job.Status.Conditions {
		if condition.Status == corev1.ConditionTrue && condition.Reason != "" {
			reason = condition.Reason
		}
	}
	result := domain.Sandbox{Name: job.Name, Namespace: job.Namespace, Status: status, Reason: reason, RepairRunID: job.Labels["sre-agent.io/repair-run-id"], Toolchain: job.Labels["sre-agent.io/toolchain"]}
	if job.Status.StartTime != nil {
		result.StartedAt = job.Status.StartTime.UTC().Format(time.RFC3339Nano)
	}
	if job.Status.CompletionTime != nil {
		result.CompletedAt = job.Status.CompletionTime.UTC().Format(time.RFC3339Nano)
	}
	return result
}

func boolPointer(value bool) *bool { return &value }

func resourcePointer(value resource.Quantity) *resource.Quantity { return &value }
