package kubernetes

import (
	"context"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
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
}

func NewJobProvisionerV1(client kubernetes.Interface, namespace, runtimeClass string) *JobProvisionerV1 {
	return &JobProvisionerV1{client: client, namespace: namespace, runtimeClass: runtimeClass}
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

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "repair-sandbox-",
			Namespace:    runner.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       "repair-sandbox",
				"app.kubernetes.io/managed-by": "sandbox-controller",
				"sre-agent.io/repair-run-id":   input.RepairRunID,
			},
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
						Command:    []string{"/bin/sh", "-c", "echo 'sandbox provisioned; repair executor is not enabled'"},
						WorkingDir: "/workspace",
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
						VolumeMounts: []corev1.VolumeMount{{Name: "workspace", MountPath: "/workspace"}},
					}},
					Volumes: []corev1.Volume{{
						Name: "workspace",
						VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{
							SizeLimit: resourcePointer(resource.MustParse("4Gi")),
						}},
					}},
				},
			},
		},
	}

	created, err := runner.client.BatchV1().Jobs(runner.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return domain.Sandbox{}, err
	}
	return domain.Sandbox{Name: created.Name, Namespace: created.Namespace, Status: "created"}, nil
}

func boolPointer(value bool) *bool { return &value }

func resourcePointer(value resource.Quantity) *resource.Quantity { return &value }
