/**
 * GitHub adapter for public issue + bounded comment pages (S62).
 * No env-token inference. No redirect follow. No auto-retry / wait loops.
 */

import { fetchPublicSafe } from "./fetch.mjs";
import { parseIssueRef, fetchPublicIssue } from "./github-issue.mjs";
import { sha256Hex } from "./hash.mjs";
import { buildObservation, commentRecord, sourceRecord } from "./issue-evidence-model.mjs";
import { classifyHttpStatus, parseLinkNext } from "./issue-evidence-transport.mjs";
import { commentBodyHash } from "./issue-evidence-delta.mjs";

export const DEFAULT_BOUNDS = Object.freeze({
  maxCommentPages: 3,
  perPage: 50,
  maxCommentBytes: 256 * 1024,
  timeoutMs: 8_000,
});

export function githubCommentsUrl(owner, repo, number, { page = 1, perPage = 50 } = {}) {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function normalizeGithubComment(raw, { orderIndex = null } = {}) {
  const body = typeof raw?.body === "string" ? raw.body : "";
  return commentRecord({
    id: raw?.id,
    url: raw?.html_url || raw?.url || null,
    author: raw?.user?.login ?? null,
    body,
    createdAt: raw?.created_at ?? null,
    updatedAt: raw?.updated_at ?? null,
    retrievalStatus: "ok",
    bodySha256: commentBodyHash(body),
    orderIndex,
  });
}

/**
 * @param {string} issueUrl explicit public GitHub issue URL
 * @param {object} options
 * @param {string|null} options.token operator-supplied token only (never process.env)
 * @param {object|null} options.fixture offline fixture observation payload
 */
export async function fetchGithubIssueEvidence(issueUrl, {
  fetchImpl = globalThis.fetch,
  token = null,
  bounds = {},
  signal = null,
  fixture = null,
} = {}) {
  const effectiveBounds = { ...DEFAULT_BOUNDS, ...Object.fromEntries(Object.entries(bounds).filter(([, v]) => v !== undefined)) };
  const ceilings = { maxCommentPages: 10, perPage: 100, maxCommentBytes: 262144, timeoutMs: 60000 };
  if (Object.entries(effectiveBounds).some(([k,v]) => !Number.isSafeInteger(v) || v < 1 || v > (ceilings[k] || 0))) return { ok: false, error: { code: "invalid_bounds", message: "finite positive pagination/read limits required" } };
  const rawFetch = fetchImpl;
  fetchImpl = async (url, init) => {
    const signalCombined = signal ? AbortSignal.any([signal, init.signal]) : init.signal;
    const response = await abortable(rawFetch(url, { ...init, signal: signalCombined }), signalCombined);
    if (!response.body?.getReader) throw new Error("streaming JSON response required");
    return { status: response.status, ok: response.ok, url: response.url, headers: response.headers,
      body: { getReader() { const reader = response.body.getReader(); return {
        read: () => abortable(reader.read(), signalCombined),
        cancel: () => abortable(Promise.resolve(reader.cancel()), signalCombined),
        releaseLock: () => reader.releaseLock?.(),
      }; } } };
  };

  // Refuse silent env credential fallback.
  if (token != null && typeof token !== "string") {
    return {
      ok: false,
      completeness: "error",
      error: { code: "invalid_token_option", message: "token must be an explicit string when provided" },
    };
  }

  if (fixture) {
    const result = observationFromFixture(fixture.observation || fixture, effectiveBounds);
    const requested = parseIssueRef(issueUrl);
    if (requested && String(result.observation.issue?.url || "").toLowerCase() !== String(requested.url).toLowerCase()) return { ok: false, error: { code: "identity_mismatch", message: "fixture differs from requested issue" } };
    return result;
  }

  const parsed = parseIssueRef(issueUrl);
  if (!parsed?.owner || !parsed?.repo || !parsed?.number) {
    return {
      ok: false,
      completeness: "error",
      error: { code: "invalid_issue_url", message: "supply an explicit public GitHub issue URL" },
    };
  }

  if (signal?.aborted) {
    return cancelledResult(issueUrl, effectiveBounds, "fetch cancelled before start");
  }

  let issueResult = await fetchPublicIssue(parsed, {
    fetchImpl,
    token: token || null,
    timeoutMs: effectiveBounds.timeoutMs,
  });
  if (!issueResult.ok && (issueResult.error?.code === "invalid_issue_body" || issueResult.error?.code === "invalid_issue_body")) {
    issueResult = {
      ...issueResult,
      error: {
        ...issueResult.error,
        code: "identity_mismatch",
        message: issueResult.error.message || "response identity does not match requested issue",
      },
    };
  }


  const sources = [];
  const pages = [];
  const transport = { issue: issueResult.transport || null, comments: [] };

  if (!issueResult.ok) {
    const status = issueResult.error?.status;
    const classified = status != null ? classifyHttpStatus(status, {}) : { retrievalStatus: "error" };
    sources.push(sourceRecord({
      url: issueResult.transport?.apiUrl || parsed.url,
      id: String(parsed.number),
      retrievalStatus: classified.retrievalStatus || "error",
      kind: "issue",
      note: issueResult.error?.code || issueResult.error?.message || null,
    }));
    return {
      ok: false,
      completeness: "error",
      error: issueResult.error,
      observation: buildObservation({
        provider: "github",
        issue: null,
        comments: [],
        sources,
        pages,
        completeness: "error",
        bounds: effectiveBounds,
        transport,
      }),
    };
  }

  const issue = {
    ...issueResult.issue,
    bodySha256: sha256Hex(issueResult.issue.body || ""),
    id: String(issueResult.issue.number),
  };
  sources.push(sourceRecord({
    url: issue.url,
    id: String(issue.number),
    updatedAt: issue.updatedAt,
    retrievalStatus: "ok",
    kind: "issue",
    bytes: issueResult.transport?.bytes ?? null,
  }));

  if (
    Number(issue.number) !== Number(parsed.number)
    || String(issue.owner).toLowerCase() !== String(parsed.owner).toLowerCase()
    || String(issue.repo).toLowerCase() !== String(parsed.repo).toLowerCase()
    || String(issue.url).toLowerCase().replace(/\/$/, "") !== `https://github.com/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`.toLowerCase()
  ) {
    sources.push(sourceRecord({
      url: issue.url,
      id: String(issue.number),
      retrievalStatus: "identity_mismatch",
      kind: "issue",
      note: "response identity does not match requested issue URL",
    }));
    return {
      ok: false,
      completeness: "error",
      error: { code: "identity_mismatch", message: "GitHub response identity mismatch" },
      observation: buildObservation({
        provider: "github",
        issue,
        comments: [],
        sources,
        completeness: "error",
        bounds: effectiveBounds,
        transport,
      }),
    };
  }

  const comments = [];
  const seenIds = new Set();
  let completeness = "complete";
  let page = 1;
  let nextUrl = githubCommentsUrl(parsed.owner, parsed.repo, parsed.number, {
    page,
    perPage: effectiveBounds.perPage,
  });

  while (nextUrl && page <= effectiveBounds.maxCommentPages) {
    if (signal?.aborted) {
      completeness = "partial";
      sources.push(sourceRecord({
        url: nextUrl,
        retrievalStatus: "cancelled",
        kind: "comments_page",
        note: `cancelled at page ${page}`,
      }));
      break;
    }

    const pageResult = await fetchCommentsPage(nextUrl, {
      fetchImpl,
      token,
      timeoutMs: effectiveBounds.timeoutMs,
    });
    transport.comments.push(pageResult.transport);
    pages.push({
      page,
      url: nextUrl,
      retrievalStatus: pageResult.retrievalStatus,
      count: pageResult.rawComments.length,
      retryAfter: pageResult.retryAfter || null,
    });
    sources.push(sourceRecord({
      url: nextUrl,
      retrievalStatus: pageResult.retrievalStatus,
      kind: "comments_page",
      bytes: pageResult.transport?.bytes ?? null,
      note: pageResult.note || null,
    }));

    if (pageResult.retrievalStatus !== "ok") {
      completeness = "partial";
      break;
    }

    if (pageResult.rawComments.length > effectiveBounds.perPage) completeness = "partial";
    for (const raw of pageResult.rawComments.slice(0, effectiveBounds.perPage)) {
      const id = raw?.id;
      const expectedIssue = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`;
      if ((!Number.isSafeInteger(id) && !(typeof id === "string" && /^\d+$/.test(id))) || seenIds.has(String(id)) || (raw.issue_url && raw.issue_url.toLowerCase() !== expectedIssue.toLowerCase()) || typeof raw.body !== "string") {
        completeness = "partial";
        sources.push(sourceRecord({ kind: "comment", id, retrievalStatus: "malformed", note: "missing/duplicate/foreign comment identity or unavailable body" }));
        continue;
      }
      seenIds.add(String(id));
      const normalized = normalizeGithubComment(raw, { orderIndex: comments.length });
      const bodyBytes = Buffer.byteLength(normalized.body, "utf8");
      if (bodyBytes > effectiveBounds.maxCommentBytes) {
        comments.push(commentRecord({
          ...normalized,
          body: "",
          bodySha256: null,
          retrievalStatus: "oversize",
          // note stored via sources; keep comment compact
        }));
        sources.push(sourceRecord({
          url: normalized.url,
          id: normalized.id,
          retrievalStatus: "oversize",
          kind: "comment",
          bytes: bodyBytes,
          note: "comment body exceeded bound; metadata retained without body",
        }));
        completeness = "partial";
      } else {
        comments.push(normalized);
      }
    }

    if (!pageResult.nextUrl) {
      nextUrl = null;
      break;
    }
    if (page >= effectiveBounds.maxCommentPages) {
      completeness = "partial";
      sources.push(sourceRecord({
        url: pageResult.nextUrl,
        retrievalStatus: "omitted",
        kind: "comments_page",
        note: `maxCommentPages=${effectiveBounds.maxCommentPages} reached; further pages omitted`,
      }));
      nextUrl = null;
      break;
    }
    const next = checkedNext(pageResult.nextUrl, parsed, page + 1, effectiveBounds.perPage);
    if (!next) {
      completeness = "partial";
      sources.push(sourceRecord({ kind: "comments_page", retrievalStatus: "identity_mismatch", note: "pagination target rejected before fetch" }));
      break;
    }
    page += 1;
    nextUrl = next;
  }

  if (Number.isInteger(issue.comments) && issue.comments !== comments.length) {
    completeness = "partial";
    sources.push(sourceRecord({ kind: "comments_page", retrievalStatus: "omitted", note: "observed count differs from issue count; concurrent edits/deletions or missing pages unknown" }));
  }
  const observation = buildObservation({
    provider: "github",
    issue,
    comments,
    sources,
    pages,
    completeness,
    bounds: effectiveBounds,
    transport,
  });

  return {
    ok: completeness === "complete",
    partial: completeness === "partial",
    completeness,
    observation,
  };
}

async function fetchCommentsPage(url, { fetchImpl, token, timeoutMs }) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "samedaydesk-recurring-job-recipes/s62",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const started = performance.now();
  let response;
  try {
    response = await fetchPublicSafe(url, { fetchImpl, headers, timeoutMs });
  } catch (error) {
    const timedOut = error?.name === "AbortError" || /abort|timeout/i.test(String(error?.message || error));
    return {
      retrievalStatus: timedOut ? "timed_out" : "error",
      rawComments: [],
      nextUrl: null,
      note: error instanceof Error ? error.message : String(error),
      transport: { apiUrl: url, elapsedMs: performance.now() - started },
    };
  }

  const classified = classifyHttpStatus(response.status, response.headers || {});
  const transport = {
    apiUrl: url,
    status: response.status,
    bytes: response.bytes ?? Buffer.byteLength(response.text || ""),
    elapsedMs: performance.now() - started,
  };

  if (!response.ok) {
    return {
      retrievalStatus: classified.retrievalStatus,
      retryAfter: classified.retryAfter,
      rawComments: [],
      nextUrl: null,
      note: classified.code || `http_${response.status}`,
      transport,
    };
  }

  let body;
  try {
    body = JSON.parse(response.text);
  } catch {
    return {
      retrievalStatus: "malformed",
      rawComments: [],
      nextUrl: null,
      note: "comments page was not JSON",
      transport,
    };
  }
  if (!Array.isArray(body)) {
    return {
      retrievalStatus: "malformed",
      rawComments: [],
      nextUrl: null,
      note: "comments page JSON was not an array",
      transport,
    };
  }

  const link = typeof response.headers?.get === "function" ? response.headers.get("link") : null;
  return {
    retrievalStatus: "ok",
    rawComments: body,
    nextUrl: parseLinkNext(link),
    transport,
  };
}

function observationFromFixture(fixture, bounds) {
  const issue = fixture.issue || null;
  const comments = Array.isArray(fixture.comments)
    ? fixture.comments.map((c, i) => {
        if (c && c.retrievalStatus) return { ...c, bodySha256: commentBodyHash(c.body), orderIndex: c.orderIndex ?? i };
        return normalizeGithubComment(c, { orderIndex: i });
      })
    : [];
  let completeness = fixture.completeness || "partial";
  if (!["complete", "partial", "error"].includes(completeness) || !issue || typeof issue.body !== "string") completeness = "error";
  if (completeness === "complete" && (!Array.isArray(fixture.comments) || comments.some(c => !c.id || c.retrievalStatus !== "ok") || new Set(comments.map(c => String(c.id))).size !== comments.length || (Number.isInteger(issue.comments) && issue.comments !== comments.length))) completeness = "partial";
  const sources = Array.isArray(fixture.sources)
    ? fixture.sources
    : [
        sourceRecord({
          url: issue?.url || null,
          id: String(issue?.number ?? ""),
          updatedAt: issue?.updatedAt ?? null,
          retrievalStatus: "ok",
          kind: "issue",
        }),
        ...comments.map((c) => sourceRecord({
          url: c.url,
          id: c.id,
          updatedAt: c.updatedAt,
          retrievalStatus: c.retrievalStatus || "ok",
          kind: "comment",
        })),
      ];
  const observation = buildObservation({
    provider: fixture.provider || "github",
    issue: issue
      ? {
          ...issue,
          bodySha256: sha256Hex(issue.body || ""),
          id: String(issue.number ?? issue.id ?? ""),
        }
      : null,
    comments,
    sources,
    pages: fixture.pages || [],
    completeness,
    bounds,
    transport: fixture.transport || { fixture: true },
  });
  return {
    ok: completeness === "complete",
    partial: completeness === "partial",
    completeness,
    observation,
  };
}

function cancelledResult(issueUrl, bounds, note) {
  return {
    ok: false,
    completeness: "error",
    error: { code: "cancelled", message: note },
    observation: buildObservation({
      provider: "github",
      completeness: "error",
      sources: [sourceRecord({ url: issueUrl, retrievalStatus: "cancelled", kind: "issue", note })],
      bounds,
    }),
  };
}

function checkedNext(raw, parsed, page, perPage) {
  try {
    const u = new URL(raw);
    const expected = new URL(githubCommentsUrl(parsed.owner, parsed.repo, parsed.number));
    if (u.origin !== expected.origin || u.pathname !== expected.pathname || u.username || u.password || u.hash || Number(u.searchParams.get("page")) !== page) return null;
    if ([...u.searchParams.keys()].some(k => !["page", "per_page"].includes(k)) || u.searchParams.getAll("page").length !== 1 || u.searchParams.getAll("per_page").length > 1) return null;
    if (u.searchParams.has("per_page") && Number(u.searchParams.get("per_page")) !== perPage) return null;
    u.searchParams.set("per_page", String(perPage));
    return u.href;
  } catch { return null; }
}

async function abortable(promise, signal) {
  signal.throwIfAborted();
  let listener;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    listener = () => reject(signal.reason); signal.addEventListener("abort", listener, { once: true });
  })]); } finally { signal.removeEventListener("abort", listener); }
}
