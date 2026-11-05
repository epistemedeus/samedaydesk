import { writeFileSync } from "node:fs";

const CLI_ENTRY = "tools/recurring-decision-consumer/cli.mjs";

const VERIFIED_NOTE = "--verified is a caller assertion that they confirmed the target runtime, not executed schema or import proof.";

/**
 * POSIX single-quote an argv token so it can join a command string
 * without shell expansion. Every ' becomes '\'' .
 */
export function shellSingleQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

export function buildSafeCommand(argv) {
  if (!Array.isArray(argv) || argv.length < 1) {
    throw new Error("buildSafeCommand requires a non-empty argv array");
  }
  return argv.map((item) => shellSingleQuote(item)).join(" ");
}

const NATIVE_ARGV = [
  "evaluate",
  "--intent",
  "<intent>",
  "--prior",
  "<prior>",
  "--capture",
  "<capture>",
  "--clock",
  "<iso>",
  "--horizon",
  "<hours>",
];

function nativeStub() {
  return {
    schema: "samedaydesk.recurring-decision-consumer-native.v0",
    entry: CLI_ENTRY,
    argv: NATIVE_ARGV.slice(),
    note: "Caller-owned native stub. Primary verified export shape. Not a resident service.",
    verifiedMeaning: VERIFIED_NOTE,
  };
}

function n8nEvaluateArguments() {
  // Expression tokens live only in the arguments array (n8n expression
  // mode). They are not concatenated into a shell command string.
  return [
    CLI_ENTRY,
    "evaluate",
    "--intent",
    "={{$json.intentPath}}",
    "--prior",
    "={{$json.priorPath}}",
    "--capture",
    "={{$json.capturePath}}",
    "--clock",
    "={{$json.clock}}",
    "--horizon",
    "={{$json.horizonHours}}",
  ];
}

function n8nStub() {
  const argumentList = n8nEvaluateArguments();
  return {
    name: "recurring-decision-consumer",
    nodes: [
      {
        name: "Evaluate",
        type: "n8n-nodes-base.executeCommand",
        parameters: {
          command: "node",
          arguments: argumentList,
        },
      },
    ],
    connections: {},
    meta: {
      schema: "samedaydesk.recurring-decision-consumer-n8n.v0",
      note: "Caller-owned stub. Not a hosted monitor. Schedule is operator-supplied. Native argv is the primary verified shape. This n8n stub passes argv as an array rather than a shell-concatenated command.",
      verifiedMeaning: VERIFIED_NOTE,
      primaryVerifiedShape: "native-argv",
      safeCommandStatic: buildSafeCommand(["node", CLI_ENTRY, "evaluate"]),
      commandStringPolicy: "If a runtime accepts only a single command string, callers must substitute pre-validated paths through buildSafeCommand(argv) / shellSingleQuote. Do not interpolate $json values unquoted into a shell command.",
    },
  };
}

/**
 * Export a caller-owned workflow only when the runtime is explicitly
 * marked --verified. That flag is a caller assertion, not executed
 * schema or import proof. Unverified requests return unsupported rather
 * than inventing a runnable automation.
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
        VERIFIED_NOTE,
      ],
    };
  }
  const body = runtime === "native" ? nativeStub() : n8nStub();
  writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
  return { ok: true, runtime, out, verified: true, primaryVerifiedShape: "native-argv" };
}
