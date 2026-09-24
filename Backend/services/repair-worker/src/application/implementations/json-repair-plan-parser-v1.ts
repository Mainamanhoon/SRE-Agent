import { z } from "zod";
import type { DiagnosisResult, RepairPlan, RepairWorkflowInput } from "../../contracts.js";
import { RepairPlanParser } from "../contracts/repair-plan-parser.js";

const planSchema = z
  .object({
    decision: z.enum(["repair", "abstain"]),
    summary: z.string().min(1).max(10_000),
    changes: z
      .array(
        z.object({
          path: z
            .string()
            .min(1)
            .max(500)
            .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/),
          content: z.string().max(500_000).optional(),
          delete: z.boolean().optional(),
        }),
      )
      .max(100),
  })
  .superRefine((plan, ctx) => {
    if (plan.decision === "repair" && plan.changes.length === 0)
      ctx.addIssue({ code: "custom", message: "repair plans require changes" });
    if (plan.decision === "abstain" && plan.changes.length !== 0)
      ctx.addIssue({ code: "custom", message: "abstentions cannot contain changes" });
    const paths = new Set<string>();
    let bytes = 0;
    for (const change of plan.changes) {
      if (paths.has(change.path))
        ctx.addIssue({ code: "custom", message: "change paths must be unique" });
      paths.add(change.path);
      bytes += Buffer.byteLength(change.content ?? "");
      if (change.delete && change.content !== undefined)
        ctx.addIssue({ code: "custom", message: "deleted files cannot contain content" });
    }
    if (bytes > 750_000)
      ctx.addIssue({ code: "custom", message: "repair plan exceeds size limit" });
  });

export class JsonRepairPlanParserV1 extends RepairPlanParser {
  public override parse(_input: RepairWorkflowInput, diagnosis: DiagnosisResult): RepairPlan {
    const text = diagnosis.finalResponse.trim();
    const payload = text.startsWith("```")
      ? text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      : text;
    return planSchema.parse(JSON.parse(payload));
  }
}
