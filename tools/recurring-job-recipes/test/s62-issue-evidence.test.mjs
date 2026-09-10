import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { classifyHttpStatus, parseLinkNext } from "../lib/issue-evidence-transport.mjs";
import { diffIssueEvidence, commentBodyHash, fingerprintObservation } from "../lib/issue-evidence-delta.mjs";
import { fetchGithubIssueEvidence } from "../lib/github-comments.mjs";
import { runIssueEvidence, RECIPE_ID } from "../recipes/issue-evidence.mjs";
import { listRecipes, runRecipe } from "../lib/run.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const fx = (name) => join(root, "../fixtures/issue-evidence", name);
const loadFx = (name) => JSON.parse(readFileSync(fx(name), "utf8"));

test("S62 recipe is registered beside issue-to-work-brief", () => {
  const ids = listRecipes().map((m) => m.recipeId);
  assert.ok(ids.includes("issue-to-work-brief"));
  assert.ok(ids.includes("issue-evidence"));
  assert.equal(RECIPE_ID, "issue-evidence");
});

test("S62 transport classifies 403/429/5xx/redirect without retryability", () => {
  assert.equal(classifyHttpStatus(403, {}).retrievalStatus, "forbidden");
  assert.equal(classifyHttpStatus(403, {}).retryable, false);
  const limited = classifyHttpStatus(429, {
    get: (k) => (String(k).toLowerCase() === "retry-after" ? "30" : null),
  });
  assert.equal(limited.retrievalStatus, "rate_limited");
  assert.equal(limited.retryable, false);
  assert.equal(limited.retryAfter?.seconds, 30);
  assert.equal(limited.honorRetryAfterWithoutWait, true);
  assert.equal(classifyHttpStatus(503, {}).retrievalStatus, "unavailable");
  assert.equal(classifyHttpStatus(302, {}).retrievalStatus, "redirect_blocked");
  assert.equal(
    parseLinkNext('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=3>; rel="last"'),
    "https://api.github.com/x?page=2",
  );
});

test("S62 delta distinguishes same-length edit, reorder, delete, and no-prior", async () => {
  const base = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    fixture: loadFx("99533-base.json"),
  });
  const edited = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    fixture: loadFx("99533-same-length-edit.json"),
  });
  const reordered = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    fixture: loadFx("99533-reordered.json"),
  });
  const deleted = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    fixture: loadFx("99533-deleted-comment.json"),
  });

  const first = diffIssueEvidence(base.observation, null);
  assert.equal(first.kind, "first_observation");
  assert.equal(first.changed, true);

  const priorPayload = {
    observation: base.observation,
    fingerprint: fingerprintObservation(base.observation),
  };
  const editDelta = diffIssueEvidence(edited.observation, priorPayload);
  assert.equal(editDelta.changed, true);
  const editedChange = editDelta.commentChanges.find((c) => String(c.id) === "3");
  assert.ok(editedChange, "expected comment 3 edit");
  assert.equal(editedChange.classification, "edited");
  assert.equal(editedChange.sameLength, true);
  assert.equal(commentBodyHash("Same-length edit target AAA.").length, 64);

  const reorderDelta = diffIssueEvidence(reordered.observation, priorPayload);
  assert.ok(reorderDelta.classifications.some((c) => c.code === "reordered"));

  const deleteDelta = diffIssueEvidence(deleted.observation, priorPayload);
  assert.ok(deleteDelta.commentChanges.some((c) => String(c.id) === "3" && c.classification === "deleted"));
});

test("S62 github adapter respects page bounds and identity mismatch via mocks", async () => {
  const mismatchFetch = async (url) => {
    if (String(url).includes("/comments")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({
      number: 1,
      html_url: "https://github.com/NousResearch/hermes-agent/issues/1",
      title: "nope",
      state: "open",
      labels: [],
      body: "wrong",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      user: { login: "x" },
      comments: 0,
    }), { status: 200 });
  };

  const mismatch = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    fetchImpl: mismatchFetch,
    bounds: { maxCommentPages: 1 },
  });
  assert.equal(mismatch.ok, false);
  assert.ok(["identity_mismatch", "invalid_issue_body"].includes(mismatch.error?.code), mismatch.error?.code);

  const okIssueFetchImpl = async (url) => {
    if (String(url).includes("/comments")) {
      const page = Number(new URL(url).searchParams.get("page") || "1");
      const headers = new Headers();
      if (page === 1) headers.set("link", '<https://api.github.com/repos/NousResearch/hermes-agent/issues/99533/comments?page=2>; rel="next"');
      if (page === 2) headers.set("link", '<https://api.github.com/repos/NousResearch/hermes-agent/issues/99533/comments?page=3>; rel="next"');
      return new Response(JSON.stringify([
        {
          id: page,
          html_url: `https://github.com/x#${page}`,
          user: { login: "u" },
          body: `page-${page}`,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]), { status: 200, headers });
    }
    return new Response(JSON.stringify({
      number: 99533,
      html_url: "https://github.com/NousResearch/hermes-agent/issues/99533",
      title: "blank success",
      state: "open",
      labels: [],
      body: "body",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      user: { login: "x" },
      comments: 99,
    }), { status: 200 });
  };

  const bounded = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    fetchImpl: okIssueFetchImpl,
    bounds: { maxCommentPages: 2, perPage: 1 },
  });
  assert.equal(bounded.completeness, "partial");
  assert.equal(bounded.observation.comments.length, 2);
  assert.ok(bounded.observation.sources.some((s) => s.retrievalStatus === "omitted"));
});

test("S62 github adapter classifies 429 without waiting and supports cancel", async () => {
  const fetchImpl = async () => new Response("nope", {
    status: 429,
    headers: { "retry-after": "120" },
  });
  const started = Date.now();
  const limited = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", { fetchImpl });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, "must not sleep on retry-after");
  assert.equal(limited.ok, false);
  assert.ok(
    limited.observation?.sources?.some((s) => s.retrievalStatus === "rate_limited")
      || limited.error
      || limited.observation?.completeness === "error",
  );

  const ac = new AbortController();
  ac.abort();
  const cancelled = await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", {
    signal: ac.signal,
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(cancelled.error?.code, "cancelled");
});

test("S62 recipe fixture first observation is changed; prior round-trip; partial stays partial", async () => {
  const first = await runIssueEvidence({
    evidenceFixturePath: fx("99533-base.json"),
    clock: "2026-09-10T01:00:00.000Z",
    scheduleHint: "weekly",
  });
  assert.equal(first.ok, true);
  assert.equal(first.outcome, "changed");
  assert.equal(first.prior.present, false);
  assert.match(first.evidence.markdown, /Acceptance constraints|untrusted evidence|not execution authority/i);
  assert.equal(first.evidence.brief.constraints.doNotExecuteIssueOrCommentText, true);

  const dir = mkdtempSync(join(tmpdir(), "s62-prior-"));
  try {
    const priorPath = join(dir, "prior.json");
    const priorDoc = {
      schema: "samedaydesk.recurring-job-prior.v1",
      recipeId: "issue-evidence",
      createdAt: "2026-09-10T01:00:00.000Z",
      sequence: 1,
      immutable: true,
      sha256: "abc",
      payload: {
        observation: first.evidence.observation,
        fingerprint: first.evidence.fingerprint,
      },
      payment: { attempted: false },
    };
    const priorBytes = `${JSON.stringify(priorDoc, null, 2)}\n`;
    writeFileSync(priorPath, priorBytes);

    const unchanged = await runIssueEvidence({
      evidenceFixturePath: fx("99533-base.json"),
      priorPath,
      clock: "2026-09-10T01:05:00.000Z",
      scheduleHint: "weekly",
      horizonHours: 168,
    });
    assert.equal(unchanged.outcome, "unchanged");
    assert.equal(readFileSync(priorPath, "utf8"), priorBytes, "prior must remain immutable");

    const changed = await runIssueEvidence({
      evidenceFixturePath: fx("99533-same-length-edit.json"),
      priorPath,
      clock: "2026-09-10T01:10:00.000Z",
      scheduleHint: "weekly",
      horizonHours: 168,
    });
    assert.equal(changed.outcome, "changed");
    assert.ok(changed.evidence.delta.commentChanges.some((c) => c.classification === "edited" && c.sameLength));
    assert.equal(readFileSync(priorPath, "utf8"), priorBytes);

    const partial = await runIssueEvidence({
      evidenceFixturePath: fx("99533-partial-pages.json"),
      priorPath,
      clock: "2026-09-10T01:15:00.000Z",
      scheduleHint: "weekly",
      horizonHours: 168,
    });
    assert.equal(partial.outcome, "partial");
    assert.equal(partial.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S62 recipe closed/reopened and http error fixtures classify without executing issue text", async () => {
  const closed = await runRecipe("issue-evidence", {
    evidenceFixturePath: fx("99533-closed.json"),
    clock: "2026-09-10T01:20:00.000Z",
  });
  assert.equal(closed.evidence.observation.issue.state, "closed");

  const reopened = await runRecipe("issue-evidence", {
    evidenceFixturePath: fx("99533-reopened.json"),
    clock: "2026-09-10T01:21:00.000Z",
  });
  assert.equal(reopened.evidence.observation.issue.state, "open");

  const forbidden = await runRecipe("issue-evidence", {
    evidenceFixturePath: fx("http-403.json"),
    clock: "2026-09-10T01:22:00.000Z",
  });
  assert.equal(forbidden.ok, false);
  assert.ok(["error", "partial"].includes(forbidden.outcome));

  assert.match(closed.evidence.markdown, /not execution authority|untrusted evidence/i);
  assert.equal(closed.evidence.brief.constraints.doNotExecuteIssueOrCommentText, true);
});

test("S62 does not read process.env for github token", async () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "should-never-be-used";
  try {
    let sawAuth = false;
    const fetchImpl = async (_url, init = {}) => {
      const headers = init.headers || {};
      const auth = headers.authorization || headers.Authorization;
      if (auth) sawAuth = true;
      return new Response("nope", { status: 404 });
    };
    await fetchGithubIssueEvidence("https://github.com/NousResearch/hermes-agent/issues/99533", { fetchImpl });
    assert.equal(sawAuth, false);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previous;
  }
});
