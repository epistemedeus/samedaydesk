/**
 * Seeded refuse paths. Always returns envelope with paymentSent=false, toolsCalled=false.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURE,
  FORBIDDEN_HEADERS,
  PAYMENT_STOP_PATHS,
  SEEDED,
  SKILL_NAMES,
  looksLikePaymentUrl,
  skillUri,
} from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import { acceptInitialize, acceptSkillsList } from "./accept.mjs";
import { assertListOnly, assertNoPaymentHeaders } from "./client.mjs";
import { loadExpectedSkills, loadPresenceIndex, skillEntry } from "./skills.mjs";
import { REPO_ROOT } from "./paths.mjs";

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
    return caught(
      e.code || "PAYMENT_HEADER_REFUSE",
      e.message,
      {
        seed: "payment-signature",
        header: e.header || header,
        headerNeverSent: true,
      },
      { header: e.header || header, forbidden: [...FORBIDDEN_HEADERS] },
    );
  }
}

export function refuseStripePath({ path = "/api/checkout" } = {}) {
  if (!looksLikePaymentUrl(path)) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("STRIPE_PATH_REFUSE", `path not recognized as payment stop: ${path}`, {
        path,
        stops: [...PAYMENT_STOP_PATHS],
      }),
      result: { seed: "stripe-path", path, refused: false },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "STRIPE_PATH_REFUSE",
      `refusing Stripe/checkout path in unpaid harness: ${path}`,
      { path, stops: [...PAYMENT_STOP_PATHS] },
    ),
    result: {
      seed: "stripe-path",
      path,
      refused: true,
      paymentSent: false,
      toolsCalled: false,
      neverOpenedCheckout: true,
    },
  });
}

export function refuseMethodNotFoundAsSuccess() {
  try {
    acceptSkillsList({
      error: { code: -32601, message: "Method not found: skills/list" },
      claimedOk: true,
    });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("METHOD_NOT_FOUND", "expected refuse for -32601 claimed as success"),
      result: { seed: "method-not-found-as-success", refused: false },
    });
  } catch (e) {
    const mcpPath = join(REPO_ROOT, "server/routes/mcp.js");
    const src = existsSync(mcpPath) ? readFileSync(mcpPath, "utf8") : "";
    const hasSkillsListCase = /case\s+["']skills\/list["']/.test(src);
    return caught(
      e.code || "METHOD_NOT_FOUND",
      e.message,
      {
        seed: "method-not-found-as-success",
        liveApexToday: "-32601",
        committedSkillsListCase: hasSkillsListCase,
        neverPostedCall: true,
      },
      e.detail,
    );
  }
}

export function refuseWellknownAsSkillsList() {
  const presence = loadPresenceIndex(REPO_ROOT) || {
    skills: SKILL_NAMES.map((name) => ({ name, files: ["SKILL.md"] })),
  };
  try {
    acceptSkillsList(presence);
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError(
        "WELLKNOWN_IS_NOT_SKILLS_LIST",
        "expected refuse for well-known HTTP index treated as skills/list",
      ),
      result: { seed: "wellknown-as-skills-list", refused: false },
    });
  } catch (e) {
    return caught(
      e.code || "WELLKNOWN_IS_NOT_SKILLS_LIST",
      e.message,
      {
        seed: "wellknown-as-skills-list",
        httpIndex: "tools/presence/fixtures/for-agents-cold-read/skills-index.json",
        hasDigest: false,
      },
      e.detail,
    );
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
  if (seedId === "payment-signature") return refusePaymentSignature(opts);
  if (seedId === "stripe-path") {
    return refuseStripePath({ path: opts.path || "/api/checkout" });
  }
  if (seedId === "method-not-found-as-success") return refuseMethodNotFoundAsSuccess();
  if (seedId === "wellknown-as-skills-list") return refuseWellknownAsSkillsList();
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}

export { SKILL_NAMES };
