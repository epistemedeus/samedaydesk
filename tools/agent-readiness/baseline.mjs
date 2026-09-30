import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTURES, KNOWN_HOST_IDS, SEEDED_HOST_IDS, captureById } from "./captures.mjs";
import { coverageOf, scoreCapture } from "./score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = join(here, "baseline", "2026-09-24.json");
export const AUDIT_DATE = "2026-09-24";
export const COVERAGE_ROWS = 136;

export function scoreAll() {
  return CAPTURES.map((capture) => scoreCapture(capture));
}

export function loadBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

export function compact(report) {
  return {
    hostId: report.hostId,
    label: report.label,
    origin: report.origin,
    role: report.role,
    heldOut: report.heldOut,
    score: report.score,
    grade: report.grade,
    earned: report.earned,
    applicable: report.applicable,
    verdict: report.verdict,
    failClosed: report.failClosed,
  };
}

export function baselineView(reports = scoreAll()) {
  const byId = new Map(reports.map((report) => [report.hostId, report]));
  const apex = byId.get("samedaydesk-apex");
  const heldOut = byId.get("held-out-seed");
  const rows = coverageOf(reports);
  return {
    auditDate: AUDIT_DATE,
    coverageRows: rows.length,
    families: [...new Set(rows.map((row) => row.family))],
    known: KNOWN_HOST_IDS.map((id) => compact(byId.get(id))),
    seeded: SEEDED_HOST_IDS.map((id) => compact(byId.get(id))),
    heldOutDiffers: Boolean(heldOut && apex && heldOut.score !== apex.score && heldOut.verdict === "reject"),
  };
}

export function compareBaseline(reports = scoreAll(), pin = loadBaseline()) {
  const view = baselineView(reports);
  const mismatches = [];
  if (view.coverageRows !== pin.coverageRows) mismatches.push(`coverageRows ${view.coverageRows} != ${pin.coverageRows}`);
  if (view.coverageRows !== COVERAGE_ROWS) mismatches.push(`coverageRows ${view.coverageRows} != ${COVERAGE_ROWS}`);
  const pinned = new Map([...(pin.known || []), ...(pin.seeded || [])].map((host) => [host.hostId, host]));
  for (const host of [...view.known, ...view.seeded]) {
    const expected = pinned.get(host.hostId);
    if (!expected) {
      mismatches.push(`missing pin ${host.hostId}`);
      continue;
    }
    for (const field of ["score", "grade", "earned", "applicable", "verdict"]) {
      if (host[field] !== expected[field]) mismatches.push(`${host.hostId}.${field} ${host[field]} != ${expected[field]}`);
    }
    if (JSON.stringify(host.failClosed) !== JSON.stringify(expected.failClosed)) {
      mismatches.push(`${host.hostId}.failClosed ${host.failClosed.join(",")} != ${(expected.failClosed || []).join(",")}`);
    }
  }
  if (pin.heldOutDiffers !== true || view.heldOutDiffers !== true) mismatches.push("held-out host does not score differently");
  const held = view.seeded.find((host) => host.hostId === "held-out-seed");
  const malformed = view.seeded.find((host) => host.hostId === "malformed-discovery");
  const handshake = view.seeded.find((host) => host.hostId === "malformed-handshake");
  const identity = view.seeded.find((host) => host.hostId === "identity-conflict");
  if (!held?.failClosed.includes("AG6_HANDSHAKE_VERSION_UNSUPPORTED")) mismatches.push("held-out missing version code");
  if (!held?.failClosed.includes("AG6_TOOLS_LIST_ID_MISMATCH")) mismatches.push("held-out missing tools id code");
  if (!malformed?.failClosed.includes("AG6_DISCOVERY_NOT_OBJECT")) mismatches.push("discovery fixture did not fail closed");
  if (!malformed?.failClosed.includes("AG6_DISCOVERY_NOT_JSON")) mismatches.push("llms fixture did not fail closed");
  if (malformed?.verdict !== "reject") mismatches.push("malformed discovery was not rejected");
  if (!handshake?.failClosed.includes("AG6_HANDSHAKE_NOT_JSONRPC")) mismatches.push("handshake fixture did not fail closed");
  if (!identity?.failClosed.includes("AG6_IDENTITY_CONFLICT")) mismatches.push("identity fixture did not fail closed");
  for (const host of [...view.known, ...view.seeded]) {
    const full = reports.find((report) => report.hostId === host.hostId);
    for (const check of full.checks) {
      if (check.failClosed && check.status === "pass") mismatches.push(`${host.hostId} ${check.id} passed while fail-closed`);
    }
  }
  return { ok: mismatches.length === 0, mismatches, view };
}

export function seededRejection(id) {
  const report = scoreCapture(captureById(id));
  return report;
}
