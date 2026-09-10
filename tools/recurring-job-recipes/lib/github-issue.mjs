import { fetchPublicSafe } from "./fetch.mjs";
import { sha256Hex } from "./hash.mjs";

/**
 * Public GitHub issue fetch (read-only). No write, no payment.
 */

export function parseIssueRef(input) {
  if (!input) return null;
  if (typeof input === "object" && input.number != null) {
    return {
      owner: input.owner || null,
      repo: input.repo || null,
      number: Number(input.number),
      url: input.url || null,
    };
  }
  const text = String(input).trim();
  const urlMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/i.exec(text);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: Number(urlMatch[3]),
      url: `https://github.com/${urlMatch[1]}/${urlMatch[2]}/issues/${urlMatch[3]}`,
    };
  }
  const short = /^([^/]+)\/([^#]+)#(\d+)$/.exec(text);
  if (short) {
    return {
      owner: short[1],
      repo: short[2],
      number: Number(short[3]),
      url: `https://github.com/${short[1]}/${short[2]}/issues/${short[3]}`,
    };
  }
  return null;
}

export async function fetchPublicIssue(ref, { fetchImpl = globalThis.fetch, token = null, timeoutMs = 8_000 } = {}) {
  const parsed = parseIssueRef(ref);
  if (!parsed?.owner || !parsed?.repo || !Number.isSafeInteger(parsed.number) || parsed.number < 1
    || !/^[A-Za-z0-9_-]+$/.test(parsed.owner) || !/^[A-Za-z0-9_.-]+$/.test(parsed.repo)) {
    return { ok: false, error: { code: "invalid_issue_ref", message: "supply owner/repo#n or github issue URL" } };
  }
  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`;
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "samedaydesk-recurring-job-recipes/s21",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const started = performance.now();
  let response;
  try {
    response = await fetchPublicSafe(apiUrl, { fetchImpl, headers, timeoutMs });
  } catch (error) {
    return { ok: false, error: { code: error.name === "AbortError" ? "timed_out" : "github_fetch_error", message: error.message, retryable: false } };
  }
  const text = response.text;
  const elapsedMs = performance.now() - started;
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: response.status === 404 ? "issue_not_found" : "github_http_error",
        message: `GitHub API status ${response.status}`,
        status: response.status,
      },
      transport: { apiUrl, status: response.status, bytes: Buffer.byteLength(text), elapsedMs },
    };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: { code: "invalid_json", message: "GitHub API returned non-JSON" },
      transport: { apiUrl, status: response.status, bytes: Buffer.byteLength(text), elapsedMs },
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.number !== parsed.number) {
    return { ok: false, error: { code: "invalid_issue_body", message: "response must identify the requested issue", retryable: false } };
  }
  return {
    ok: true,
    issue: normalizeIssue(body, parsed),
    transport: {
      apiUrl,
      status: response.status,
      bytes: Buffer.byteLength(text),
      elapsedMs,
      observedAt: new Date().toISOString(),
    },
  };
}

export function normalizeIssue(body, parsed) {
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    number: body.number ?? parsed.number,
    url: body.html_url || parsed.url,
    title: body.title ?? null,
    state: body.state ?? null,
    labels: Array.isArray(body.labels)
      ? body.labels.map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean)
      : [],
    body: typeof body.body === "string" ? body.body : "",
    createdAt: body.created_at ?? null,
    updatedAt: body.updated_at ?? null,
    author: body.user?.login ?? null,
    comments: Number.isFinite(body.comments) ? body.comments : null,
  };
}

export function issueFingerprint(issue) {
  return {
    owner: issue.owner,
    repo: issue.repo,
    url: issue.url,
    bodySha256: sha256Hex(issue.body || ""),
    number: issue.number,
    state: issue.state,
    title: issue.title,
    labels: [...(issue.labels || [])].sort(),
    updatedAt: issue.updatedAt,
    bodyBytes: Buffer.byteLength(issue.body || "", "utf8"),
  };
}
