import { AppsV1Api, KubeConfig } from "@kubernetes/client-node";
import { KubernetesAppsApiFactory } from "./kubernetes-apps-api-factory.js";

export class KubernetesClientNodeAppsApiFactoryV1 extends KubernetesAppsApiFactory {
  public constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {
    super();
  }

  public override create(): AppsV1Api {
    const config = new KubeConfig();
    if (this.environment.KUBERNETES_SERVICE_HOST) {
      config.loadFromCluster();
    } else {
      config.loadFromDefault();
    }
    return config.makeApiClient(AppsV1Api);
  }
}
