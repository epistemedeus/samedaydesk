const BEARER_RE = /Bearer\s+\S+/gi;
const CLAIM_TOKEN_RE = /[?&]claim=[^&\s"']+/gi;

const SECRET_KEYS = new Set([
  "token",
  "claimtoken",
  "authorization",
  "password",
  "secret",
  "credential",
  "passportnumber",
  "ssn",
  "documenturl",
  "addressproofurl",
  "granttoken",
]);

export function collectSecrets(...values) {
  return values.filter((value) => typeof value === "string" && value.length >= 8);
}

export function redactString(text, secrets = []) {
  let out = String(text);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out.replace(BEARER_RE, "Bearer [redacted]").replace(CLAIM_TOKEN_RE, (match) => {
    const prefix = match[0] === "?" || match[0] === "&" ? match[0] : "";
    return `${prefix}claim=[redacted]`;
  });
}

export function redactSecrets(value, secrets = []) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value, secrets);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secrets));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(String(key).toLowerCase())) out[key] = "[redacted]";
    else out[key] = redactSecrets(item, secrets);
  }
  return out;
}

/** Default prepare/status stdout: redact claim token in URLs and omit claimToken. */
export function publicHandoffView(value, { showClaimUrl = false } = {}) {
  const secrets = collectSecrets(value?.claimToken);
  const view = redactSecrets(value, secrets);
  if (value?.complete === true && typeof value.claimUrl === "string") {
    delete view.claimToken;
    if (showClaimUrl) {
      view.claimUrl = value.claimUrl;
      view.handoffNotice =
        "Full claimUrl shown because --show-claim-url was set. Forward only to the intended human. Do not log, publish, or put in analytics. Claim is not payment.";
    } else {
      view.claimUrl = redactString(value.claimUrl, secrets);
      view.claimUrlNotice =
        "claim token redacted by default. Pass --show-claim-url to print the full claimUrl for human handoff (also echoed once on stderr).";
    }
  }
  return view;
}

