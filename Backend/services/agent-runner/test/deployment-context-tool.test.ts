import type {
  AppsV1Api,
  AppsV1ApiListNamespacedDeploymentRequest,
  V1DeploymentList,
} from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";
import {
  type DeploymentContextQuery,
  DeploymentContextSource,
} from "../src/application/contracts/deployment-context-source.js";
import { AllowlistedDeploymentNamespacePolicyV1 } from "../src/application/implementations/allowlisted-deployment-namespace-policy-v1.js";
import { GetDeploymentContextToolV1 } from "../src/application/tools/get-deployment-context-tool-v1.js";
import { KubernetesAppsApiFactory } from "../src/infrastructure/kubernetes/kubernetes-apps-api-factory.js";
import { KubernetesDeploymentContextSourceV1 } from "../src/infrastructure/kubernetes/kubernetes-deployment-context-source-v1.js";

class StubDeploymentContextSource extends DeploymentContextSource {
  public query?: DeploymentContextQuery;

  public override async getDeploymentContext(query: DeploymentContextQuery) {
    this.query = query;
    return {
      provider: "kubernetes",
      service: query.service,
      namespace: query.namespace ?? "default",
      deployments: [],
      truncated: false,
    };
  }
}

class StubKubernetesAppsApiFactory extends KubernetesAppsApiFactory {
  public constructor(private readonly api: AppsV1Api) {
    super();
  }

  public override create(): AppsV1Api {
    return this.api;
  }
}

const context = { repairRunId: "repair-1", workspacePath: "C:/workspace" };

describe("deployment context tool", () => {
  it("validates service and namespace names before querying the source", async () => {
    const source = new StubDeploymentContextSource();
    const tool = new GetDeploymentContextToolV1(source);
    const input = tool.validate({ service: "checkout-api", namespace: "production" });

    await expect(tool.execute(context, input)).resolves.toMatchObject({
      provider: "kubernetes",
      service: "checkout-api",
      namespace: "production",
    });
    expect(source.query).toEqual(input);
    expect(() => tool.validate({ service: "../checkout" })).toThrow();
  });

  it("allows only configured namespaces and always includes the default", () => {
    const policy = new AllowlistedDeploymentNamespacePolicyV1("production", [
      "production",
      "staging",
    ]);

    expect(policy.resolve()).toBe("production");
    expect(policy.resolve("staging")).toBe("staging");
    expect(() => policy.resolve("kube-system")).toThrow(/not allowed/);
    expect(() => new AllowlistedDeploymentNamespacePolicyV1("production", ["staging"])).toThrow(
      /default/,
    );
  });

  it("returns bounded, normalized Kubernetes rollout evidence", async () => {
    let request: AppsV1ApiListNamespacedDeploymentRequest | undefined;
    const response: V1DeploymentList = {
      apiVersion: "apps/v1",
      kind: "DeploymentList",
      metadata: {},
      items: [
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "checkout-api",
            namespace: "production",
            creationTimestamp: new Date("2026-09-23T00:00:00Z"),
            generation: 8,
            labels: { "app.kubernetes.io/name": "checkout-api" },
            annotations: { "deployment.kubernetes.io/revision": "8" },
          },
          spec: {
            replicas: 4,
            selector: { matchLabels: { app: "checkout-api" } },
            template: {
              metadata: { labels: { app: "checkout-api" } },
              spec: {
                containers: [{ name: "api", image: "registry/checkout:sha-123" }],
              },
            },
          },
          status: {
            observedGeneration: 8,
            readyReplicas: 3,
            availableReplicas: 3,
            updatedReplicas: 4,
            unavailableReplicas: 1,
            conditions: [
              {
                type: "Available",
                status: "False",
                reason: "MinimumReplicasUnavailable",
                lastTransitionTime: new Date("2026-09-23T00:01:00Z"),
              },
            ],
          },
        },
      ],
    };
    const api = {
      listNamespacedDeployment: async (input: AppsV1ApiListNamespacedDeploymentRequest) => {
        request = input;
        return response;
      },
    } as unknown as AppsV1Api;
    const source = new KubernetesDeploymentContextSourceV1(
      new StubKubernetesAppsApiFactory(api),
      new AllowlistedDeploymentNamespacePolicyV1("production", ["production"]),
      "app.kubernetes.io/name",
    );

    await expect(source.getDeploymentContext({ service: "checkout-api" })).resolves.toEqual({
      provider: "kubernetes",
      service: "checkout-api",
      namespace: "production",
      truncated: false,
      deployments: [
        expect.objectContaining({
          name: "checkout-api",
          desiredReplicas: 4,
          readyReplicas: 3,
          containers: [{ name: "api", image: "registry/checkout:sha-123" }],
          conditions: [expect.objectContaining({ reason: "MinimumReplicasUnavailable" })],
        }),
      ],
    });
    expect(request).toEqual({
      namespace: "production",
      labelSelector: "app.kubernetes.io/name=checkout-api",
      limit: 10,
    });
  });
});
