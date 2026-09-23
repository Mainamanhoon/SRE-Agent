import type { RepairAgentEvent, RepairAgentEventKind } from "../../domain/repair-agent.js";
import type { DeepSeekNotification } from "./deepseek-runtime-client.js";

export class DeepSeekEventMapperV1 {
  public map(notification: DeepSeekNotification, sequence: number): RepairAgentEvent {
    const event = asRecord(notification.params.event);
    const eventType = typeof event?.type === "string" ? event.type : notification.method;
    const data = asRecord(event?.data) ?? notification.params;

    return {
      sequence,
      kind: this.kindFor(notification.method, eventType),
      name: eventType,
      data,
    };
  }

  private kindFor(method: string, eventType: string): RepairAgentEventKind {
    if (method === "session.status") {
      return "agent.status";
    }
    if (eventType === "assistant/message") {
      return "agent.message";
    }
    if (eventType.includes("tool")) {
      return "tool.activity";
    }
    return "agent.activity";
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
}
