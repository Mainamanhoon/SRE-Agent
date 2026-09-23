import type { V1Deployment } from "@kubernetes/client-node";
import {
  type DeploymentContextQuery,
  type DeploymentContextResult,
  DeploymentContextSource,
  type DeploymentNamespacePolicy,
  type DeploymentRecord,
} from "../../application/contracts/deployment-context-source.js";
import type { KubernetesAppsApiFactory } from "./kubernetes-apps-api-factory.js";

const MAX_DEPLOYMENTS = 10;

export class KubernetesDeploymentContextSourceV1 extends DeploymentContextSource {
  public constructor(
    private readonly clients: KubernetesAppsApiFactory,
    private readonly namespaces: DeploymentNamespacePolicy,
    private readonly serviceLabel: string,
  ) {
    super();
  }

  public override async getDeploymentContext(
    query: DeploymentContextQuery,
    signal?: AbortSignal,
  ): Promise<DeploymentContextResult> {
    signal?.throwIfAborted();
    const namespace = this.namespaces.resolve(query.namespace);
    const response = await raceWithAbort(
      this.clients.create().listNamespacedDeployment({
        namespace,
        labelSelector: `${this.serviceLabel}=${query.service}`,
        limit: MAX_DEPLOYMENTS,
      }),
      signal,
    );
    signal?.throwIfAborted();

    return {
      provider: "kubernetes",
      service: query.service,
      namespace,
      deployments: response.items.slice(0, MAX_DEPLOYMENTS).map(mapDeployment),
      truncated: Boolean(response.metadata?._continue) || response.items.length > MAX_DEPLOYMENTS,
    };
  }
}

function raceWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }
  signal.throwIfAborted();

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("deployment query was cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function mapDeployment(deployment: V1Deployment): DeploymentRecord {
  return {
    name: deployment.metadata?.name ?? "unknown",
    namespace: deployment.metadata?.namespace ?? "unknown",
    createdAt: deployment.metadata?.creationTimestamp?.toISOString(),
    generation: deployment.metadata?.generation,
    observedGeneration: deployment.status?.observedGeneration,
    desiredReplicas: deployment.spec?.replicas ?? 1,
    readyReplicas: deployment.status?.readyReplicas ?? 0,
    availableReplicas: deployment.status?.availableReplicas ?? 0,
    updatedReplicas: deployment.status?.updatedReplicas ?? 0,
    unavailableReplicas: deployment.status?.unavailableReplicas ?? 0,
    labels: deployment.metadata?.labels ?? {},
    annotations: deployment.metadata?.annotations ?? {},
    selector: deployment.spec?.selector.matchLabels ?? {},
    containers: (deployment.spec?.template.spec?.containers ?? []).map((container) => ({
      name: container.name,
      image: container.image ?? "unknown",
    })),
    conditions: (deployment.status?.conditions ?? []).map((condition) => ({
      type: condition.type,
      status: condition.status,
      reason: condition.reason,
      message: condition.message,
      lastTransitionTime: condition.lastTransitionTime?.toISOString(),
    })),
  };
}
