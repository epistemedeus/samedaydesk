import { readFileSync } from "node:fs";

export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const AVAILABILITY_PATH = new URL("../config/paid-gateway-availability.json", import.meta.url);
const RECEIVED_CHECKS = ["configuredRuntime", "freshAuthority", "oldAuthorityRefused", "retainedState", "sharedConsumers"];

// This is a received dependency state, not a health probe or a launch ledger.
export function validateGatewayState(input) {
  if (!input || !["available", "paused", "unknown"].includes(input.state)) throw new Error("Unknown gateway state");
  if (typeof input.observedAt !== "string" || !Number.isFinite(Date.parse(input.observedAt)) ||
      new Date(input.observedAt).toISOString() !== input.observedAt) throw new Error("Gateway ISO observation time required");
  if (input.state === "available") {
    const evidence = input.received;
    if (!evidence || !/^[a-f0-9]{40}$/.test(evidence.sourceCommit || "") ||
        typeof evidence.deploymentId !== "string" || !evidence.deploymentId.trim() ||
        typeof evidence.receipt !== "string" || !evidence.receipt.trim() ||
        evidence.observedAt !== input.observedAt ||
        !RECEIVED_CHECKS.every((name) => evidence[name] === true)) {
      throw new Error("Available requires received configured runtime and authority evidence");
    }
  }
  return input;
}

export function readGatewayState() {
  try { return validateGatewayState(JSON.parse(readFileSync(AVAILABILITY_PATH, "utf8"))); }
  catch { return { state: "unknown", observedAt: null }; }
}

export function gatewayAvailability(input = readGatewayState()) {
  let state;
  try { state = validateGatewayState(input); }
  catch { state = { state: "unknown", observedAt: null }; }
  const callable = state.state === "available";
  const summary = callable
    ? "Paid gateway available. Read its current inventory and terms before a remote job."
    : state.state === "paused"
      ? "Paid gateway temporarily paused. Do not submit paid remote jobs."
      : "Paid gateway availability unconfirmed. Do not submit paid remote jobs.";
  return {
    origin: GATEWAY_ORIGIN,
    state: state.state,
    callable,
    observedAt: state.observedAt,
    summary,
    nextAction: callable ? `${GATEWAY_ORIGIN}/.well-known/x402` : "https://samedaydesk.com/discovery/useful-jobs.json",
    alternatives: {
      freeApexMcp: "https://samedaydesk.com/mcp",
      offlinePackages: "https://samedaydesk.com/discovery/useful-jobs.json",
      originalTask: "https://samedaydesk.com/discovery/original-task-correspondence.json",
    },
    preservation: "Free apex tools, original-task correspondence and hosted offline archives are separate. Acquired packages remain usable offline; retained entitlements are unchanged.",
  };
}

export function gatewayGuideBlock(input) {
  const availability = gatewayAvailability(input);
  const inventory = availability.callable ? "Current inventory and terms" : "Identity reference only; check availability before connecting";
  return [
    "<!-- paid-gateway:start -->",
    `- ${availability.summary} State received: ${availability.observedAt || "unknown"}.`,
    `- ${availability.preservation}`,
    "- [Paid gateway availability](https://samedaydesk.com/discovery/paid-gateway.json): Current dependency state and next action. A past launch or source merge does not establish availability.",
    `- [Paid machine gateway MCP](${GATEWAY_ORIGIN}/mcp): ${inventory}.`,
    ...(availability.callable ? [`- Practical paid job: \`POST ${GATEWAY_ORIGIN}/extract/batch\`. Read current inventory and bounded job terms before submitting.`] : []),
    `- [Optional Smithery directory listing](https://smithery.ai/servers/epistemedeus/samedaydesk-machine-commerce): Directory identity only. Canonical endpoint: ${GATEWAY_ORIGIN}/mcp, with no Smithery account, key, or proxy. Check availability before connecting.`,
    ...[["x402 resource manifest", "/.well-known/x402"], ["x402 gateway llms.txt", "/llms.txt"], ["x402 service health", "/healthz"], ["HTTP action catalog", "/api/actions"]].map(([label, path]) => `- [${label}](${GATEWAY_ORIGIN}${path}): ${inventory}.`),
    `- Next action: ${availability.nextAction}`,
    "<!-- paid-gateway:end -->",
  ].join("\n");
}
