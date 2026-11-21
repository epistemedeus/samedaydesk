import { writeFileSync } from "node:fs";

const CLI_ENTRY = "tools/recurring-decision-consumer/cli.mjs";

const INSTANCE_BASE = "https://neomorphic.app.n8n.cloud";
const API_PATH = "/api/v1";
const MCP_PATH = "/mcp-server/http";
const API_LOCATOR = "KCH-0939616A8FF4997851894232";
const MCP_LOCATOR = "KCH-AE454DDB4C2532D780A0E689";
const API_LOCATOR_NAME = "N8N_API_KEY";
const MCP_LOCATOR_NAME = "N8N_MCP_TOKEN";

const VERIFIED_NOTE = "--verified is a caller assertion that they confirmed the target runtime, not executed schema or import proof. The flag alone is insufficient. Treat the n8n route as confirmed only after a live schema or MCP probe.";
const VERIFIED_MEANS = "live_schema_or_mcp_probe_not_flag";

/**
 * POSIX single-quote an argv token so it can join a command string
 * without shell expansion. Every ' becomes '\'' .
 */
export function shellSingleQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

/**
 * Build a command string from an argv array only. Every element is
 * single-quoted. Callers must pass already-resolved, pre-validated
 * values. Never concatenate unquoted interpolations.
 */
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
    note: "Caller-owned native stub. Primary verified export shape and solid direct baseline. Not a resident service.",
    verifiedMeaning: VERIFIED_NOTE,
    verifiedMeans: VERIFIED_MEANS,
  };
}

function n8nStub() {
  const evaluateUrl = "={{$json.evaluateUrl}}";
  const jsonBody = "={{ JSON.stringify({ intent: $json.intent, prior: $json.prior, capture: $json.capture, clock: $json.clock, horizonHours: $json.horizonHours, previous: $json.previous, reference: $json.reference }) }}";
  return {
    name: "recurring-decision-consumer",
    nodes: [
      {
        id: "evaluate-webhook",
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [40, 300],
        webhookId: "recurring-decision-evaluate",
        parameters: {
          httpMethod: "POST",
          path: "recurring-decision-evaluate",
          responseMode: "lastNode",
          options: {},
        },
      },
      {
        id: "evaluate-https",
        name: "Evaluate HTTPS",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [280, 300],
        parameters: {
          method: "POST",
          url: evaluateUrl,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "content-type", value: "application/json" },
            ],
          },
          sendBody: true,
          contentType: "json",
          specifyBody: "json",
          jsonBody,
          options: {},
        },
      },
    ],
    connections: {
      Webhook: {
        main: [[{ node: "Evaluate HTTPS", type: "main", index: 0 }]],
      },
    },
    meta: {
      schema: "samedaydesk.recurring-decision-consumer-n8n.v0",
      note: "Caller-owned stub. Not a hosted monitor and not a resident evaluate service. Execute Command is unavailable on n8n Cloud and disabled by default from n8n 2.0, so this export never ships executeCommand or a shell stub. The Webhook accepts inbound items; the HTTP Request node POSTs evaluate inputs to a caller-supplied HTTPS evaluateUrl. Mount receiveEvaluateRequest from src/http-adapter.mjs on that endpoint. Native argv remains the solid direct baseline. No customer-data capture and no unbudgeted execution.",
      verifiedMeaning: VERIFIED_NOTE,
      verifiedMeans: VERIFIED_MEANS,
      primaryVerifiedShape: "native-argv",
      instanceBase: INSTANCE_BASE,
      apiBase: `${INSTANCE_BASE}${API_PATH}`,
      apiPath: API_PATH,
      apiLocator: API_LOCATOR,
      apiLocatorName: API_LOCATOR_NAME,
      mcpLocator: MCP_LOCATOR,
      mcpLocatorName: MCP_LOCATOR_NAME,
      mcpPath: MCP_PATH,
      mcpUrl: `${INSTANCE_BASE}${MCP_PATH}`,
      evaluateUrlPlaceholder: evaluateUrl,
      executeCommand: false,
    },
  };
}

/**
 * Export a caller-owned workflow only when the runtime is explicitly
 * marked --verified. That flag is a caller assertion, not a live schema
 * or MCP probe, and is not sufficient on its own.
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
      message: "export-workflow requires --verified after the caller confirms the target runtime schema. --verified alone is insufficient; confirm via a live schema or MCP probe.",
      cannotEstablish: [
        "This tool does not claim the remote n8n/native schema without caller verification.",
        VERIFIED_NOTE,
      ],
      verifiedMeans: VERIFIED_MEANS,
    };
  }
  const body = runtime === "native" ? nativeStub() : n8nStub();
  writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
  return {
    ok: true,
    runtime,
    out,
    verified: true,
    verifiedMeans: VERIFIED_MEANS,
    primaryVerifiedShape: "native-argv",
    message: VERIFIED_NOTE,
  };
}
