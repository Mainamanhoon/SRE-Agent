import type {
  RepairToolCatalog,
  RepairToolExecutor,
  RepairToolPermission,
} from "../application/contracts/repair-tool.js";
import type { RepairToolAuditSink } from "../application/contracts/repair-tool-audit.js";
import { AllowlistedDeploymentNamespacePolicyV1 } from "../application/implementations/allowlisted-deployment-namespace-policy-v1.js";
import { AllowlistedRepairToolAuthorizationPolicyV1 } from "../application/implementations/allowlisted-repair-tool-authorization-policy-v1.js";
import { InMemoryRepairToolCallBudgetV1 } from "../application/implementations/in-memory-repair-tool-call-budget-v1.js";
import { RepairToolCatalogV1 } from "../application/implementations/repair-tool-catalog-v1.js";
import { RepairToolExecutorV1 } from "../application/implementations/repair-tool-executor-v1.js";
import { FindTestsToolV1 } from "../application/tools/find-tests-tool-v1.js";
import { GetDeploymentContextToolV1 } from "../application/tools/get-deployment-context-tool-v1.js";
import { GetIncidentToolV1 } from "../application/tools/get-incident-tool-v1.js";
import { GetRecentChangesToolV1 } from "../application/tools/get-recent-changes-tool-v1.js";
import { GetServiceTopologyToolV1 } from "../application/tools/get-service-topology-tool-v1.js";
import { GetTraceToolV1 } from "../application/tools/get-trace-tool-v1.js";
import { QueryLogsToolV1 } from "../application/tools/query-logs-tool-v1.js";
import { QueryMetricsToolV1 } from "../application/tools/query-metrics-tool-v1.js";
import { ReadFileRangeToolV1 } from "../application/tools/read-file-range-tool-v1.js";
import { SearchCodeToolV1 } from "../application/tools/search-code-tool-v1.js";
import type { AgentRunnerConfig } from "../config.js";
import { JsonLinesRepairToolAuditSinkV1 } from "../infrastructure/audit/json-lines-repair-tool-audit-sink-v1.js";
import { SystemRepairToolClockV1 } from "../infrastructure/clock/system-repair-tool-clock-v1.js";
import { ControlApiServiceTopologySourceV1 } from "../infrastructure/http/control-api-service-topology-source-v1.js";
import { FetchJsonHttpClientV1 } from "../infrastructure/http/fetch-json-http-client-v1.js";
import { HttpIncidentEvidenceSourceV1 } from "../infrastructure/http/http-incident-evidence-source-v1.js";
import { JaegerTraceEvidenceSourceV1 } from "../infrastructure/http/jaeger-trace-evidence-source-v1.js";
import { LokiLogQuerySourceV1 } from "../infrastructure/http/loki-log-query-source-v1.js";
import { PrometheusMetricQuerySourceV1 } from "../infrastructure/http/prometheus-metric-query-source-v1.js";
import { KubernetesClientNodeAppsApiFactoryV1 } from "../infrastructure/kubernetes/kubernetes-client-node-apps-api-factory-v1.js";
import { KubernetesDeploymentContextSourceV1 } from "../infrastructure/kubernetes/kubernetes-deployment-context-source-v1.js";
import { CanonicalWorkspacePathPolicyV1 } from "../infrastructure/workspace/canonical-workspace-path-policy-v1.js";
import { GitRecentChangesSourceV1 } from "../infrastructure/workspace/git-recent-changes-source-v1.js";
import { NodeReadOnlyProcessRunnerV1 } from "../infrastructure/workspace/node-read-only-process-runner-v1.js";
import { NodeWorkspaceFileSourceV1 } from "../infrastructure/workspace/node-workspace-file-source-v1.js";
import { RipgrepCodeSearchSourceV1 } from "../infrastructure/workspace/ripgrep-code-search-source-v1.js";
import { RipgrepTestFileSourceV1 } from "../infrastructure/workspace/ripgrep-test-file-source-v1.js";

export interface RepairToolRuntime {
  catalog: RepairToolCatalog;
  executor: RepairToolExecutor;
}

export interface RepairToolRuntimeOptions {
  allowedPermissions?: readonly RepairToolPermission[];
  audit?: RepairToolAuditSink;
}

export function createRepairToolRuntime(
  config: AgentRunnerConfig,
  options: RepairToolRuntimeOptions = {},
): RepairToolRuntime {
  const http = new FetchJsonHttpClientV1();
  const httpOptions = {
    timeoutMs: config.READ_ONLY_TOOL_TIMEOUT_MS,
    maxResponseBytes: config.READ_ONLY_TOOL_MAX_RESPONSE_BYTES,
  };
  const paths = new CanonicalWorkspacePathPolicyV1(config.AGENT_WORKSPACE_PATH);
  const processes = new NodeReadOnlyProcessRunnerV1();
  const ripgrepOptions = {
    executable: config.RIPGREP_EXECUTABLE,
    timeoutMs: config.READ_ONLY_TOOL_TIMEOUT_MS,
    maxOutputBytes: config.READ_ONLY_TOOL_MAX_RESPONSE_BYTES,
  };
  const catalog = new RepairToolCatalogV1([
    new GetServiceTopologyToolV1(
      new ControlApiServiceTopologySourceV1(http, new URL(config.CONTROL_API_URL), httpOptions),
    ),
    new GetIncidentToolV1(
      new HttpIncidentEvidenceSourceV1(http, new URL(config.INCIDENT_SERVICE_URL), httpOptions),
    ),
    new GetTraceToolV1(
      new JaegerTraceEvidenceSourceV1(http, new URL(config.TRACE_QUERY_URL), httpOptions),
    ),
    new QueryLogsToolV1(
      new LokiLogQuerySourceV1(http, new URL(config.LOKI_QUERY_URL), httpOptions),
    ),
    new QueryMetricsToolV1(
      new PrometheusMetricQuerySourceV1(http, new URL(config.PROMETHEUS_QUERY_URL), httpOptions),
    ),
    new GetDeploymentContextToolV1(
      new KubernetesDeploymentContextSourceV1(
        new KubernetesClientNodeAppsApiFactoryV1(),
        new AllowlistedDeploymentNamespacePolicyV1(
          config.KUBERNETES_DEFAULT_NAMESPACE,
          parseCommaSeparatedValues(config.KUBERNETES_ALLOWED_NAMESPACES),
        ),
        config.KUBERNETES_SERVICE_LABEL,
      ),
    ),
    new GetRecentChangesToolV1(
      new GitRecentChangesSourceV1(paths, processes, {
        executable: config.GIT_EXECUTABLE,
        timeoutMs: config.READ_ONLY_TOOL_TIMEOUT_MS,
        maxOutputBytes: config.READ_ONLY_TOOL_MAX_RESPONSE_BYTES,
      }),
    ),
    new ReadFileRangeToolV1(
      new NodeWorkspaceFileSourceV1(paths, config.READ_ONLY_TOOL_MAX_FILE_BYTES),
    ),
    new SearchCodeToolV1(new RipgrepCodeSearchSourceV1(paths, processes, ripgrepOptions)),
    new FindTestsToolV1(new RipgrepTestFileSourceV1(paths, processes, ripgrepOptions)),
  ]);
  const audit =
    options.audit ?? new JsonLinesRepairToolAuditSinkV1((line) => process.stderr.write(line));
  const authorization = new AllowlistedRepairToolAuthorizationPolicyV1(
    options.allowedPermissions ?? ["read"],
  );

  return {
    catalog,
    executor: new RepairToolExecutorV1(
      catalog,
      authorization,
      new InMemoryRepairToolCallBudgetV1(config.MAX_TOOL_CALLS_PER_RUN),
      audit,
      new SystemRepairToolClockV1(),
    ),
  };
}

function parseCommaSeparatedValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
