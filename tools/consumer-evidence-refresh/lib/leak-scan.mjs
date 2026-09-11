/**
 * Fail-closed private-data scan. Cases must already be redacted.
 * Hits on email / phone / account id / token / Bearer refuse the refresh.
 */

export const LEAK_PATTERNS = Object.freeze([
  {
    id: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: "bearer",
    re: /\bBearer\s+[A-Za-z0-9._\-+=/]+/g,
  },
  {
    id: "token_sk",
    re: /\bsk_(?:live|test)_[A-Za-z0-9]+\b/g,
  },
  {
    id: "github_pat",
    re: /\b(?:ghp|github_pat)_[A-Za-z0-9_]+\b/g,
  },
  {
    id: "slack_token",
    re: /\bxox[baprs]-[A-Za-z0-9-]+\b/g,
  },
  {
    id: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]+\b/g,
  },
  {
    id: "phone_e164",
    re: /\+[1-9]\d{9,14}\b/g,
  },
  {
    id: "phone_us",
    re: /\b(?:\+1[-. ]?)?(?:\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4})\b/g,
  },
  {
    id: "account_acct",
    re: /\bacct_[A-Za-z0-9]{8,}\b/g,
  },
  {
    id: "account_cus",
    re: /\bcus_[A-Za-z0-9]{8,}\b/g,
  },
]);

function stringify(value) {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function scanLeaks(value, { source = "input" } = {}) {
  const text = stringify(value);
  const hits = [];
  for (const pattern of LEAK_PATTERNS) {
    pattern.re.lastIndex = 0;
    const found = text.match(pattern.re);
    if (found && found.length) {
      hits.push({
        id: pattern.id,
        source,
        count: found.length,
        sample: redactSample(found[0]),
      });
    }
  }
  return {
    ok: hits.length === 0,
    privateLeak: hits.length > 0,
    hits,
  };
}

function redactSample(fragment) {
  if (typeof fragment !== "string") return "";
  if (fragment.length <= 6) return "***";
  return `${fragment.slice(0, 3)}…${fragment.slice(-2)}`;
}

export function scanMany(entries) {
  const hits = [];
  for (const entry of entries) {
    const result = scanLeaks(entry.value, { source: entry.source });
    hits.push(...result.hits);
  }
  return {
    ok: hits.length === 0,
    privateLeak: hits.length > 0,
    hits,
  };
}
