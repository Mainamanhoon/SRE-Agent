import { DeploymentNamespacePolicy } from "../contracts/deployment-context-source.js";

export class AllowlistedDeploymentNamespacePolicyV1 extends DeploymentNamespacePolicy {
  private readonly allowed: ReadonlySet<string>;

  public constructor(
    private readonly defaultNamespace: string,
    allowedNamespaces: readonly string[],
  ) {
    super();
    this.allowed = new Set(allowedNamespaces);
    if (!this.allowed.has(defaultNamespace)) {
      throw new Error("default deployment namespace must be included in the namespace allowlist");
    }
  }

  public override resolve(requestedNamespace?: string): string {
    const namespace = requestedNamespace ?? this.defaultNamespace;
    if (!this.allowed.has(namespace)) {
      throw new Error(`deployment namespace "${namespace}" is not allowed`);
    }
    return namespace;
  }
}
