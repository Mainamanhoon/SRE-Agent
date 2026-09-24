import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import {
  RepairWorkflowGateway,
  type RepairWorkflowHandle,
  type StartRepairCommand,
} from "../../application/contracts/repair-workflow-gateway.js";

export interface TemporalRepairWorkflowSettings {
  address: string;
  namespace: string;
  taskQueue: string;
}
export class TemporalRepairWorkflowGatewayV1 extends RepairWorkflowGateway {
  private clientPromise?: Promise<Client>;
  public constructor(private readonly settings: TemporalRepairWorkflowSettings) {
    super();
  }
  public override async start(command: StartRepairCommand): Promise<RepairWorkflowHandle> {
    const client = await this.client();
    const workflowId = this.workflowId(command.repairRunId);
    try {
      const handle = await client.workflow.start("repairWorkflow", {
        args: [command],
        workflowId,
        taskQueue: this.settings.taskQueue,
      });
      return { workflowId, runId: handle.firstExecutionRunId, status: "RUNNING" };
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      return this.describe(command.repairRunId);
    }
  }
  public override async describe(repairRunId: string): Promise<RepairWorkflowHandle> {
    const workflowId = this.workflowId(repairRunId);
    const description = await (await this.client()).workflow.getHandle(workflowId).describe();
    return { workflowId, runId: description.runId, status: description.status.name };
  }
  private client(): Promise<Client> {
    this.clientPromise ??= Connection.connect({ address: this.settings.address }).then(
      (connection) => new Client({ connection, namespace: this.settings.namespace }),
    );
    return this.clientPromise;
  }
  private workflowId(repairRunId: string): string {
    return `repair-${repairRunId}`;
  }
}
