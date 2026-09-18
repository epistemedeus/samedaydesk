/**
 * Seeded refuse paths. Always returns envelope with paymentSent=false, toolsCalled=false.
 */
import { FEATURE, SEEDED, SKILL_NAMES, skillUri } from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import { acceptInitialize, acceptSkillsList } from "./accept.mjs";
import { assertListOnly, assertNoPaymentHeaders } from "./client.mjs";
import { loadExpectedSkills, skillEntry } from "./skills.mjs";

function caught(code, message, result, detail) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(code, message, detail),
    result: { ...result, refused: true, paymentSent: false, toolsCalled: false },
  });
}

export function refuseSilentEmpty() {
  try {
    acceptSkillsList({
      ok: true,
      resultType: "complete",
      skills: [],
      ttlMs: 300000,
      cacheScope: "public",
    });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("SILENT_EMPTY", "expected refuse for empty ok:true skills list"),
      result: { seed: "silent-empty-success", refused: false },
    });
  } catch (e) {
    return caught(e.code || "SILENT_EMPTY", e.message, { seed: "silent-empty-success" }, e.detail);
  }
}

export function refuseMissingSkill() {
  const expected = loadExpectedSkills();
  const partial = expected.filter((f) => f.name !== "web-extract").map(skillEntry);
  try {
    acceptSkillsList({ resultType: "complete", skills: partial }, expected);
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("MISSING_SKILL", "expected refuse for list omitting web-extract"),
      result: { seed: "missing-skill", refused: false },
    });
  } catch (e) {
    return caught(
      e.code || "MISSING_SKILL",
      e.message,
      { seed: "missing-skill", omitted: "web-extract" },
      e.detail,
    );
  }
}

export function refuseDigestMismatch() {
  const expected = loadExpectedSkills();
  const skills = expected.map((file) => {
    const entry = skillEntry(file);
    if (file.name === "web-extract") {
      entry.resources[0].digest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    }
    return entry;
  });
  try {
    acceptSkillsList({ resultType: "complete", skills }, expected);
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("DIGEST_MISMATCH", "expected refuse for forged web-extract digest"),
      result: { seed: "digest-mismatch", refused: false },
    });
  } catch (e) {
    return caught(
      e.code || "DIGEST_MISMATCH",
      e.message,
      { seed: "digest-mismatch", uri: skillUri("web-extract") },
      e.detail,
    );
  }
}

export function refuseToolsCall({ tool = "generate_complete_fix_pack" } = {}) {
  try {
    assertListOnly("tools/call", { name: tool });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("TOOLS_CALL_REFUSE", `expected refuse for tools/call ${tool}`),
      result: { seed: "tools-call", tool, refused: false },
    });
  } catch (e) {
    return caught(e.code || "TOOLS_CALL_REFUSE", e.message, {
      seed: "tools-call",
      tool: e.tool || tool,
      neverPostedCall: true,
    });
  }
}

export function refuseProtocol20260728Only() {
  try {
    acceptInitialize({
      protocolVersion: "2026-07-28",
      only: true,
      serverInfo: { name: "samedaydesk-agent-tools", version: "1.2.0" },
      capabilities: { extensions: { "io.modelcontextprotocol/skills": {} } },
    });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("PROTOCOL_REFUSE", "expected refuse for 2026-07-28-only handshake"),
      result: { seed: "protocol-2026-07-28-only", refused: false },
    });
  } catch (e) {
    return caught(e.code || "PROTOCOL_REFUSE", e.message, {
      seed: "protocol-2026-07-28-only",
      negotiated: "2024-11-05",
      rejected: "2026-07-28-only",
    }, e.detail);
  }
}

export function refusePaymentSignature({
  header = "PAYMENT-SIGNATURE",
  value = "seeded-fake-sig",
} = {}) {
  try {
    assertNoPaymentHeaders({ [header]: value });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("PAYMENT_HEADER_REFUSE", `expected refuse for header ${header}`),
      result: { seed: "payment-signature", header, refused: false },
    });
  } catch (e) {
    return caught(e.code || "PAYMENT_HEADER_REFUSE", e.message, {
      seed: "payment-signature",
      header: e.header || header,
      headerNeverSent: true,
    });
  }
}

export function runSeeded(seedId, opts = {}) {
  const seed = SEEDED[seedId];
  if (!seed) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "usage",
      error: failError("USAGE", `unknown seeded failure: ${seedId}`, {
        known: Object.keys(SEEDED),
      }),
    });
  }
  if (seedId === "silent-empty-success") return refuseSilentEmpty();
  if (seedId === "missing-skill") return refuseMissingSkill();
  if (seedId === "digest-mismatch") return refuseDigestMismatch();
  if (seedId === "tools-call") return refuseToolsCall(opts);
  if (seedId === "protocol-2026-07-28-only") return refuseProtocol20260728Only();
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}

export { SKILL_NAMES };
