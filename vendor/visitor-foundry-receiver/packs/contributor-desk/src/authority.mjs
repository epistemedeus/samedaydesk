import { ALLOWED_PAYOUT_DESTINATION_RE, CODE } from "./constants.mjs";
import { contributorHoldsPayoutKeyError, deskHoldsSecretError } from "./errors.mjs";

const EARNED_WORK_SECRET_KEY =
  /^EARNED_WORK_(?:[A-Z0-9_]+_)?(?:OWNER_TOKEN|ADMIN_TOKEN|SECRET|PRIVATE_KEY|PAYOUT_KEY|TOKEN)$/;

const CONFIG_SECRET_KEYS = new Set([
  "ownerToken",
  "ownerBearer",
  "earnedWorkSecret",
  "earnedWorkOwnerToken",
  "earnedWorkPayoutKey",
  "EARNED_WORK_OWNER_TOKEN",
  "EARNED_WORK_SECRET",
]);

const FLAG_SECRET_KEYS = new Set([
  "owner-token",
  "ownerToken",
  "earned-work-secret",
  "earnedWorkSecret",
  "earned-work-owner-token",
  "as-owner",
  "claim-authority",
  "grant-payout",
]);

const PAYOUT_KEY_ENV = new Set([
  "PAYOUT_KEY",
  "PAYOUT_PRIVATE_KEY",
  "CONTRIBUTOR_PAYOUT_KEY",
  "WALLET_PRIVATE_KEY",
  "EARNED_WORK_PAYOUT_KEY",
]);

const PAYOUT_KEY_FIELDS = new Set([
  "payoutKey",
  "payoutPrivateKey",
  "payoutSigningKey",
  "privateKey",
  "secretKey",
  "seedPhrase",
  "mnemonic",
  "walletPrivateKey",
]);

const WALLET_FIELDS = new Set([
  "wallet",
  "walletConnect",
  "walletSignature",
  "signedTypedData",
  "fromWallet",
  "chainAccount",
]);

/** Prose / public identifiers. Do not treat ordinary English as a seed phrase. */
const PROSE_FIELDS = new Set([
  "reason",
  "title",
  "summary",
  "taskId",
  "contributorPublicId",
  "termsVersion",
  "digestSha256",
  "idempotencyKey",
  "mediaType",
  "note",
  "message",
  "wallet",
  "payoutDestination",
]);

function nonempty(value) {
  if (value == null) return false;
  if (typeof value === "boolean") return value === true;
  if (typeof value === "number") return true;
  return String(value).trim() !== "";
}

function keyHits(source, record, predicate) {
  const hits = [];
  if (!record || typeof record !== "object") return hits;
  for (const [key, value] of Object.entries(record)) {
    if (!predicate(key, value)) continue;
    if (!nonempty(value) && value !== true) continue;
    hits.push({ source, key });
  }
  return hits;
}

export function isEarnedWorkSecretKey(key) {
  return typeof key === "string" && EARNED_WORK_SECRET_KEY.test(key);
}

export function looksLikeRawKeyMaterial(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  if (/^sha256:[0-9a-f]{64}$/.test(text)) return false;
  if (ALLOWED_PAYOUT_DESTINATION_RE.test(text)) return false;
  if (/^0x[0-9a-fA-F]{64}$/.test(text)) return true;
  if (/^[0-9a-fA-F]{64}$/.test(text)) return true;
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) return true;
  return false;
}

export function looksLikePayoutKeyMaterial(value) {
  if (looksLikeRawKeyMaterial(value)) return true;
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  if (/payout[_-]?key/i.test(text) && text.length <= 200) return true;
  const words = text.toLowerCase().split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((word) => /^[a-z]+$/.test(word))) {
    return true;
  }
  return false;
}

export function textHoldsEarnedWorkSecret(value) {
  if (typeof value !== "string") return false;
  return /EARNED_WORK_(?:[A-Z0-9_]*_)?(?:OWNER_TOKEN|ADMIN_TOKEN|SECRET|PRIVATE_KEY|PAYOUT_KEY|TOKEN)\s*=/.test(
    value,
  );
}

export function inspectDeskAuthority({ env = {}, config = {}, flags = {} } = {}) {
  const hits = [
    ...keyHits("env", env, (key) => isEarnedWorkSecretKey(key)),
    ...keyHits("config", config, (key) => CONFIG_SECRET_KEYS.has(key) || isEarnedWorkSecretKey(key)),
    ...keyHits("flags", flags, (key) => FLAG_SECRET_KEYS.has(key) || isEarnedWorkSecretKey(key)),
  ];

  if (hits.length) {
    return {
      ok: false,
      rejected: true,
      killed: false,
      code: CODE.DESK_HOLDS_EARNED_WORK_SECRET,
      hits,
      error: deskHoldsSecretError({ hits }),
    };
  }

  return {
    ok: true,
    rejected: false,
    killed: false,
    code: null,
    hits: [],
    error: null,
  };
}

export function inspectContributorPayoutKey({
  contributor = {},
  env = {},
  session = {},
  flags = {},
} = {}) {
  const hits = [];

  if (contributor.holdsPayoutKey === true) {
    hits.push({ source: "contributor", key: "holdsPayoutKey" });
  }

  for (const [key, value] of Object.entries(contributor ?? {})) {
    if (PAYOUT_KEY_FIELDS.has(key) && nonempty(value)) hits.push({ source: "contributor", key });
    if (key === "payoutDestination" && looksLikePayoutKeyMaterial(value)) {
      hits.push({ source: "contributor", key: "payoutDestination" });
    }
    if (PROSE_FIELDS.has(key)) continue;
    if (looksLikeRawKeyMaterial(value)) {
      if (!hits.some((hit) => hit.source === "contributor" && hit.key === key)) {
        hits.push({ source: "contributor", key });
      }
    }
  }

  hits.push(
    ...keyHits("env", env, (key) => PAYOUT_KEY_ENV.has(key)),
    ...keyHits("session", session, (key) => PAYOUT_KEY_FIELDS.has(key) || key === "holdsPayoutKey"),
    ...keyHits("flags", flags, (key) =>
      ["payout-key", "payoutKey", "contributor-payout-key"].includes(key),
    ),
  );

  const unique = [];
  const seen = new Set();
  for (const hit of hits) {
    const id = `${hit.source}:${hit.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(hit);
  }

  if (unique.length) {
    return {
      ok: false,
      rejected: false,
      killed: true,
      code: CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
      hits: unique,
      error: contributorHoldsPayoutKeyError({ hits: unique }),
    };
  }

  return {
    ok: true,
    rejected: false,
    killed: false,
    code: null,
    hits: [],
    error: null,
  };
}

export function inspectWalletless(input = {}) {
  const hits = [];
  for (const [key, value] of Object.entries(input)) {
    if (!WALLET_FIELDS.has(key)) continue;
    if (!nonempty(value) && value !== true) continue;
    hits.push({ source: "claim", key });
  }
  if (input.walletRequired === true || input.requireWallet === true) {
    hits.push({ source: "claim", key: "walletRequired" });
  }
  if (hits.length) {
    return {
      ok: false,
      code: CODE.NOT_WALLETLESS,
      hits,
    };
  }
  return { ok: true, code: null, hits: [] };
}

export function inspectPayoutDestination(value) {
  if (value == null || String(value).trim() === "") {
    return { ok: true, destination: null };
  }
  const destination = String(value).trim();
  if (looksLikePayoutKeyMaterial(destination)) {
    return {
      ok: false,
      killed: true,
      code: CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
      error: contributorHoldsPayoutKeyError({ hits: [{ source: "contributor", key: "payoutDestination" }] }),
    };
  }
  if (!ALLOWED_PAYOUT_DESTINATION_RE.test(destination)) {
    return {
      ok: false,
      code: CODE.INVALID_INPUT,
      message: "Late address must be an allowlisted USDC/base 0x destination, not a key.",
    };
  }
  return { ok: true, destination };
}

export function inspectFieldText(value) {
  if (typeof value !== "string") return { ok: true };
  if (textHoldsEarnedWorkSecret(value)) {
    return {
      ok: false,
      rejected: true,
      code: CODE.DESK_HOLDS_EARNED_WORK_SECRET,
      error: deskHoldsSecretError({ hits: [{ source: "field", key: "text" }] }),
    };
  }
  if (looksLikeRawKeyMaterial(value)) {
    return {
      ok: false,
      killed: true,
      code: CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
      error: contributorHoldsPayoutKeyError({ hits: [{ source: "field", key: "text" }] }),
    };
  }
  return { ok: true };
}
