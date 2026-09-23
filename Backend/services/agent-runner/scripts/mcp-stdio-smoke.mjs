import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "..", "..", "..");
const environment = {
  ...getDefaultEnvironment(),
  REPAIR_RUN_ID: "mcp-stdio-smoke",
  AGENT_WORKSPACE_PATH: repositoryRoot,
  CONTROL_API_URL: "http://localhost:4000",
  INCIDENT_SERVICE_URL: "http://localhost:4020",
  LOKI_QUERY_URL: "http://localhost:3100",
  PROMETHEUS_QUERY_URL: "http://localhost:9090",
  KUBERNETES_ALLOWED_NAMESPACES: "default",
  KUBERNETES_DEFAULT_NAMESPACE: "default",
  KUBERNETES_SERVICE_LABEL: "app.kubernetes.io/name",
  TRACE_QUERY_URL: "http://localhost:16686",
  SERVICE_VERSION: "smoke",
};
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(packageRoot, "dist", "mcp-server.js")],
  env: environment,
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});
const client = new Client({ name: "sre-agent-mcp-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const expectedNames = [
    "getServiceTopology",
    "getIncident",
    "getTrace",
    "queryLogs",
    "queryMetrics",
    "getDeploymentContext",
    "getRecentChanges",
    "readFileRange",
    "searchCode",
    "findTests",
  ];
  const names = listed.tools.map((tool) => tool.name);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`Unexpected MCP tool catalog: ${JSON.stringify(names)}`);
  }
  const result = await client.callTool({
    name: "readFileRange",
    arguments: { path: "README.md", startLine: 1, endLine: 3 },
  });
  if (result.isError) {
    throw new Error(`MCP read smoke failed: ${JSON.stringify(result.content)}`);
  }
  process.stdout.write(
    `${JSON.stringify({
      toolCount: names.length,
      names,
      readSucceeded: true,
      auditWritten: stderr.includes("repair_tool_invocation"),
    })}\n`,
  );
} finally {
  await client.close();
}
