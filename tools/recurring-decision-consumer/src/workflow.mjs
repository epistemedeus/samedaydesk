import { writeFileSync } from "node:fs";

/**
 * Export a caller-owned workflow only when the runtime/schema is explicitly verified.
 * Unverified requests return unsupported rather than inventing a runnable automation.
 */
export function exportWorkflowStub({ runtime, out, verified = false }) {
  if (runtime !== "n8n" && runtime !== "native") {
    return {
      ok: false,
      outcome: "unsupported",
      reason: "runtime_unsupported",
      message: "runtime must be n8n or native",
    };
  }
  if (!verified) {
    return {
      ok: false,
      outcome: "unsupported",
      reason: "runtime_schema_unverified",
      message: "export-workflow requires --verified after the caller confirms the target runtime schema",
      cannotEstablish: [
        "This tool does not claim the remote n8n/native schema without caller verification.",
      ],
    };
  }
  const body = runtime === "n8n"
    ? {
      name: "recurring-decision-consumer",
      nodes: [
        {
          name: "Evaluate",
          type: "n8n-nodes-base.executeCommand",
          parameters: {
            command: "node tools/recurring-decision-consumer/cli.mjs evaluate --intent {{$json.intentPath}} --prior {{$json.priorPath}} --capture {{$json.capturePath}} --clock {{$json.clock}} --horizon {{$json.horizonHours}}",
          },
        },
      ],
      connections: {},
      meta: {
        schema: "samedaydesk.recurring-decision-consumer-n8n.v0",
        note: "Caller-owned stub. Not a hosted monitor. Schedule is operator-supplied.",
      },
    }
    : {
      schema: "samedaydesk.recurring-decision-consumer-native.v0",
      entry: "tools/recurring-decision-consumer/cli.mjs",
      argv: ["evaluate", "--intent", "<intent>", "--prior", "<prior>", "--capture", "<capture>", "--clock", "<iso>", "--horizon", "<hours>"],
      note: "Caller-owned native stub. Not a resident service.",
    };
  writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
  return { ok: true, runtime, out, verified: true };
}
