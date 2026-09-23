import {
  fromJsonSchema,
  type JsonSchemaType,
  McpServer,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { type StdioServerHandle, serveStdio } from "@modelcontextprotocol/server/stdio";
import type {
  RepairToolCatalog,
  RepairToolContext,
  RepairToolExecutor,
} from "../../application/contracts/repair-tool.js";
import { RepairToolServer } from "../../application/contracts/repair-tool-server.js";

export interface McpStdioRepairToolServerOptions {
  serviceVersion: string;
  context: Omit<RepairToolContext, "signal">;
  maxResultBytes: number;
  onError?: (error: Error) => void;
}

export class McpStdioRepairToolServerV1 extends RepairToolServer {
  private handle?: StdioServerHandle;

  public constructor(
    private readonly tools: RepairToolCatalog,
    private readonly executor: RepairToolExecutor,
    private readonly options: McpStdioRepairToolServerOptions,
  ) {
    super();
  }

  public createProtocolServer(): McpServer {
    const server = new McpServer({
      name: "sre-agent-project-tools",
      version: this.options.serviceVersion,
    });

    for (const descriptor of this.tools.list()) {
      const inputSchema = fromJsonSchema(descriptor.inputSchema as JsonSchemaType);
      server.registerTool(
        descriptor.name,
        {
          title: `${descriptor.name} ${descriptor.version}`,
          description: descriptor.description,
          inputSchema,
          annotations: annotationsFor(descriptor.permission),
          _meta: {
            "io.sre-agent/tool-version": descriptor.version,
            "io.sre-agent/permission": descriptor.permission,
          },
        },
        async (input, requestContext) => {
          const result = await this.executor.execute(
            descriptor.name,
            {
              ...this.options.context,
              signal: requestContext.mcpReq.signal,
            },
            input,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: serializeBoundedResult(result, this.options.maxResultBytes),
              },
            ],
          };
        },
      );
    }

    return server;
  }

  public override async start(): Promise<void> {
    if (this.handle) {
      throw new Error("MCP repair tool server is already started");
    }
    this.handle = serveStdio(() => this.createProtocolServer(), {
      legacy: "serve",
      onerror: this.options.onError,
    });
  }

  public override async close(): Promise<void> {
    const handle = this.handle;
    this.handle = undefined;
    await handle?.close();
  }
}

function annotationsFor(permission: string): ToolAnnotations {
  return {
    readOnlyHint: permission === "read",
    destructiveHint: false,
    idempotentHint: permission === "read",
  };
}

function serializeBoundedResult(result: unknown, maxBytes: number): string {
  const serialized = JSON.stringify(result);
  const text = serialized ?? "null";
  const size = Buffer.byteLength(text, "utf8");
  if (size > maxBytes) {
    throw new Error(`Repair tool result exceeds ${maxBytes} bytes`);
  }
  return text;
}
