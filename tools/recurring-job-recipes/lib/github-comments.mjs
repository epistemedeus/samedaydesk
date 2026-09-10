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
  const effectiveBounds = { ...DEFAULT_BOUNDS, ...bounds };

  // Refuse silent env credential fallback.
  if (token != null && typeof token !== "string") {
    return {
      ok: false,
      completeness: "error",
      error: { code: "invalid_token_option", message: "token must be an explicit string when provided" },
    };
  }

  if (fixture) return observationFromFixture(fixture, effectiveBounds);

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

    for (const raw of pageResult.rawComments) {
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
    page += 1;
    nextUrl = pageResult.nextUrl;
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
        if (c && c.retrievalStatus && c.bodySha256) return { ...c, orderIndex: c.orderIndex ?? i };
        return normalizeGithubComment(c, { orderIndex: i });
      })
    : [];
  const completeness = fixture.completeness || "complete";
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
          bodySha256: issue.bodySha256 || sha256Hex(issue.body || ""),
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
