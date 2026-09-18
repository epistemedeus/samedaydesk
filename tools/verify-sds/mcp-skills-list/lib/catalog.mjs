/** SDS MCP skills/list pin (SEP-2640). Names match the committed presence index. */

export const FEATURE = "mcp-skills-list";

export const MCP_PROTOCOL = "2024-11-05";
export const MCP_SERVER_INFO = Object.freeze({
  name: "samedaydesk-agent-tools",
  version: "1.2.0",
});

export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";

export const SKILL_NAMES = Object.freeze([
  "web-extract",
  "page-change",
  "explicit-record",
]);

/** Verbatim descriptions from tools/presence/fixtures/for-agents-cold-read/skills-index.json. */
export const SKILL_DESCRIPTIONS = Object.freeze({
  "web-extract":
    "Read credential-free public webpages as structured JSON or clean LLM-ready Markdown. Use GET /extract for one public HTTPS page, one bounded POST /extract/batch for 2–5 caller-supplied public HTTPS URLs with explicit desired fields, or GET /read for Markdown. A caller may explicitly request a one-item batch. Do not use for authenticated or private-network content.",
  "page-change":
    "Offline compare of two extract-batch JSON field snapshots. Use when the caller already has two delivered POST /extract/batch JSON files and wants selected-field diffs without fetching, paying, retrying, or scheduling. Do not use to purchase a second observation.",
  "explicit-record":
    "Project already-held SameDayDesk GET /extract or POST /extract/batch JSON into buyer-named records using explicit JSON Pointers and a local JSON Schema. Use when the caller already has observation JSON plus mapping and schema files. Do not fetch, pay, infer entities, or treat payment as useful output. Partial, missing, ambiguous, and invalid outcomes stay explicit.",
});

export const APEX_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const PRESENCE_SKILLS_INDEX_REL =
  "tools/presence/fixtures/for-agents-cold-read/skills-index.json";

export const FORBIDDEN_HEADERS = Object.freeze([
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
]);

export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
  "/mcp?cs=",
  "buy.stripe.com",
  "/extract/batch",
]);

/**
 * True when a URL or path is a Stripe / checkout / cs_ license / paid extract path.
 * Fail-closed so --origin cannot POST to payment surfaces.
 */
export function looksLikePaymentUrl(value) {
  const s = String(value || "");
  if (!s) return false;
  const lower = s.toLowerCase();
  for (const p of PAYMENT_STOP_PATHS) {
    if (lower.includes(p.toLowerCase())) return true;
  }
  if (/(?:^|[?&/])cs=|cs_test_|cs_live_|\/api\/stripe\b/i.test(s)) return true;
  if (/(?:^|[^a-z])\/extract(?:\?|$|\/)/i.test(s)) return true;
  try {
    const u = new URL(s);
    if (u.searchParams.has("cs") && String(u.searchParams.get("cs") || "").length > 0) {
      return true;
    }
    if (/(^|\.)stripe\.com$/i.test(u.hostname)) return true;
  } catch {
    /* relative path or non-URL */
  }
  return false;
}

export const SEEDED = Object.freeze({
  "silent-empty-success": {
    id: "silent-empty-success",
    why: "HTTP-shaped {ok:true, skills:[]} must not count as a skills/list. Three named skills are required.",
    errorCode: "SILENT_EMPTY",
    expectExit: 1,
  },
  "missing-skill": {
    id: "missing-skill",
    why: "A list that omits web-extract is not a complete SDS skills/list.",
    errorCode: "MISSING_SKILL",
    expectExit: 1,
  },
  "digest-mismatch": {
    id: "digest-mismatch",
    why: "Resource digest must match the committed SKILL.md bytes. A forged digest is not a list.",
    errorCode: "DIGEST_MISMATCH",
    expectExit: 1,
  },
  "tools-call": {
    id: "tools-call",
    why: "skills/list verify never POSTs tools/call (paid Fix Pack / extract paths).",
    errorCode: "TOOLS_CALL_REFUSE",
    expectExit: 1,
  },
  "protocol-2026-07-28-only": {
    id: "protocol-2026-07-28-only",
    why: "SDS apex fail-closes initialize to 2024-11-05. A 2026-07-28-only handshake is not a transport migration and is not this list.",
    errorCode: "PROTOCOL_REFUSE",
    expectExit: 1,
  },
  "payment-signature": {
    id: "payment-signature",
    why: "Never send PAYMENT-SIGNATURE / X-PAYMENT. Seed proves the refuse before any wire I/O.",
    errorCode: "PAYMENT_HEADER_REFUSE",
    expectExit: 1,
  },
  "stripe-path": {
    id: "stripe-path",
    why: "Stripe checkout / webhook / cs_ license redemption paths are out of unpaid skills/list scope.",
    errorCode: "STRIPE_PATH_REFUSE",
    expectExit: 1,
  },
  "method-not-found-as-success": {
    id: "method-not-found-as-success",
    why: "JSON-RPC -32601 (live apex today) is not a skills/list. Claiming it already works must fail.",
    errorCode: "METHOD_NOT_FOUND",
    expectExit: 1,
  },
  "wellknown-as-skills-list": {
    id: "wellknown-as-skills-list",
    why: "HTTP /.well-known/skills/index.json (name/description/files, no digest) is not SEP-2640 skills/list.",
    errorCode: "WELLKNOWN_IS_NOT_SKILLS_LIST",
    expectExit: 1,
  },
});

export function skillUri(name) {
  return `skill://${name}/SKILL.md`;
}
