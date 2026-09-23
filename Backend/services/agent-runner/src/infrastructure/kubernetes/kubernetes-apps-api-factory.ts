import type { AppsV1Api } from "@kubernetes/client-node";

export abstract class KubernetesAppsApiFactory {
  public abstract create(): AppsV1Api;
}
