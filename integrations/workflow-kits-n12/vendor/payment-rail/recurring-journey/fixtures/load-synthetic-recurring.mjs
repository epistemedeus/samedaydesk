import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export function loadJson(name) {
  return JSON.parse(readFileSync(join(dir, name), "utf8"));
}

export function workExchangeCaller() {
  return loadJson("synthetic-work-exchange-caller.json");
}

export function agentEntryCaller() {
  return loadJson("synthetic-agent-entry-caller.json");
}

export function periodNCapture() {
  return loadJson("synthetic-period-n-capture.json");
}

export function periodNPlus1Same() {
  return loadJson("synthetic-period-n-plus-1-same.json");
}

export function periodNPlus1Changed() {
  return loadJson("synthetic-period-n-plus-1-changed.json");
}

export function hostedEquivalentSame() {
  return loadJson("synthetic-n8n-equivalent-same.json");
}

export function exchangeRecords() {
  return loadJson("synthetic-exchange-preview.json");
}

export function periodNPreview() {
  return exchangeRecords().periodN;
}

export function periodNPlus1Preview() {
  return exchangeRecords().periodNPlus1;
}

export function periodNReadAccepted() {
  return exchangeRecords().readAcceptedPeriodN;
}

export function termsInputFromCaller(caller, options = {}) {
  const {
    contextId,
    followsTaskId = null,
    readAccepted = null,
    claimedTermsVersion = null,
  } = options;
  const preview = Object.prototype.hasOwnProperty.call(options, "preview")
    ? options.preview
    : periodNPreview();
  return {
    caller: caller.caller,
    request: caller.request,
    reward: caller.reward,
    contextId: contextId ?? caller.contextId,
    followsTaskId,
    preview,
    readAccepted,
    claimedTermsVersion,
  };
}

function evidenceFor(contract) {
  return [
    { name: "termsVersion", value: contract.request.body.termsVersion },
    { name: "captureId", value: contract.request.body.captureId },
    { name: "comparisonRecord", value: { expected: "accepted-output", observed: "accepted-output" } },
  ];
}

export function usefulDelivery(contract) {
  return {
    committed: true,
    requestDigest: contract.requestDigest,
    result: contract.outcome.expectedResult,
    evidence: evidenceFor(contract),
  };
}

export function uncommittedDelivery(contract) {
  return { ...usefulDelivery(contract), committed: false };
}

export function periodNPlus1SchemaChange() {
  return loadJson("synthetic-later-period-schema-change.json");
}

export const CLOCK = "2026-11-12T10:30:00.000Z";
