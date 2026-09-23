export interface DeploymentContextQuery {
  service: string;
  namespace?: string;
}

export interface DeploymentContainer {
  name: string;
  image: string;
}

export interface DeploymentCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface DeploymentRecord {
  name: string;
  namespace: string;
  createdAt?: string;
  generation?: number;
  observedGeneration?: number;
  desiredReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  unavailableReplicas: number;
  labels: Readonly<Record<string, string>>;
  annotations: Readonly<Record<string, string>>;
  selector: Readonly<Record<string, string>>;
  containers: readonly DeploymentContainer[];
  conditions: readonly DeploymentCondition[];
}

export interface DeploymentContextResult {
  provider: string;
  service: string;
  namespace: string;
  deployments: readonly DeploymentRecord[];
  truncated: boolean;
}

export abstract class DeploymentContextSource {
  public abstract getDeploymentContext(
    query: DeploymentContextQuery,
    signal?: AbortSignal,
  ): Promise<DeploymentContextResult>;
}

export abstract class DeploymentNamespacePolicy {
  public abstract resolve(requestedNamespace?: string): string;
}
