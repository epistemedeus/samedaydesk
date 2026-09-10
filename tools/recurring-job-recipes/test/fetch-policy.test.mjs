import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractComparableFields, fetchLiveSafe, withRetries } from "../lib/fetch.mjs";
import { runRecipe, FIXTURES_DIR } from "../lib/run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 1024 * 1024;

function prior(name) {
  return join(FIXTURES_DIR, "priors", name);
}
function page(name) {
  return join(FIXTURES_DIR, "pages", name);
}

function headerMap(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]),
  );
  return {
    get(name) {
      const value = normalized[String(name).toLowerCase()];
      return value == null ? null : String(value);
    },
  };
}

function mockResponse({
  status = 200,
  url = "https://example.com/",
  text = "",
  headers = {},
  body,
} = {}) {
  const state = { textReads: 0 };
  const response = {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: headerMap(headers),
    text: async () => {
      state.textReads += 1;
      return text;
    },
  };
  if (body) response.body = body;
  return { response, state };
}

function streamBody(chunks) {
  const state = { reads: 0, cancelled: false, released: false, index: 0 };
  const body = {
    getReader() {
      return {
        async read() {
          if (state.cancelled || state.index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = chunks[state.index++];
          state.reads += 1;
          return { done: false, value };
        },
        async cancel() {
          state.cancelled = true;
        },
        releaseLock() {
          state.released = true;
        },
      };
    },
  };
  return { body, state };
}

async function expectPolicyFailure(fn, messagePattern) {
  try {
    await fn();
  } catch (error) {
    assert.equal(error.retryable, false, error.message);
    assert.match(error.message, messagePattern);
    return error;
  }
  assert.fail("expected a non-retryable live-safe policy failure");
}

async function sourceChangeWithFetch(fetchImpl, extra = {}) {
  return runRecipe("source-change-alert", {
    priorPath: prior("source-change.prior.json"),
    liveSafe: true,
    liveUrl: extra.liveUrl || "https://example.com/",
    fields: extra.fields || ["title"],
    clock: "2026-09-09T15:00:00.000Z",
    retries: extra.retries ?? 2,
    retryDelayMs: 0,
    fetchImpl,
    allowMountedOrigin: extra.allowMountedOrigin,
  });
}

test("fetchLiveSafe uses manual redirect mode and rejects 3xx even to the allowlist", async () => {
  let calls = 0;
  let redirectMode = null;
  let method = null;
  const { response, state } = mockResponse({
    status: 302,
    url: "https://example.com/",
    text: "<title>should not be read</title>",
    headers: { location: "https://example.com/" },
  });

  await expectPolicyFailure(
    () =>
      fetchLiveSafe("https://example.com/", {
        fetchImpl: async (_url, init) => {
          calls += 1;
          redirectMode = init.redirect;
          method = init.method;
          return response;
        },
      }),
    /live-safe redirects are not followed/,
  );

  assert.equal(calls, 1);
  assert.equal(redirectMode, "manual");
  assert.equal(method, "GET");
  assert.equal(state.textReads, 0);
});

test("fetchLiveSafe rejects 301/302/303/307/308 without following Location", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const { response, state } = mockResponse({
      status,
      url: "https://example.com/",
      text: "<title>redirect body</title>",
      headers: { location: "https://example.com/" },
    });
    await expectPolicyFailure(
      () =>
        fetchLiveSafe("https://example.com/", {
          fetchImpl: async () => {
            calls += 1;
            return response;
          },
        }),
      /live-safe redirects are not followed/,
    );
    assert.equal(calls, 1, `status ${status} should fetch once`);
    assert.equal(state.textReads, 0, `status ${status} must not read the body`);
  }
});

test("fetchLiveSafe revalidates the final response URL against the allowlist", async () => {
  const { response, state } = mockResponse({
    status: 200,
    url: "http://169.254.169.254/latest/meta-data/",
    text: "<title>private destination</title>",
  });
  await expectPolicyFailure(
    () =>
      fetchLiveSafe("https://example.com/", {
        fetchImpl: async () => response,
      }),
    /live-safe allowlist rejected final url: http:\/\/169\.254\.169\.254\/latest\/meta-data\//,
  );
  assert.equal(state.textReads, 0);
});

test("fetchLiveSafe rejects an allowlisted request whose 200 final URL left the allowlist", async () => {
  const { response, state } = mockResponse({
    status: 200,
    url: "https://example.net/phish",
    text: "<title>phish</title>",
  });
  await expectPolicyFailure(
    () =>
      fetchLiveSafe("https://example.com/", {
        fetchImpl: async () => response,
      }),
    /rejected final url: https:\/\/example.net\/phish/,
  );
  assert.equal(state.textReads, 0);
});

test("fetchLiveSafe rejects the initial URL before calling fetch", async () => {
  let calls = 0;
  await expectPolicyFailure(
    () =>
      fetchLiveSafe("https://not-example.com/", {
        fetchImpl: async () => {
          calls += 1;
          return mockResponse().response;
        },
      }),
    /live-safe allowlist rejected url: https:\/\/not-example.com\//,
  );
  assert.equal(calls, 0);
});

test("fetchLiveSafe rejects mounted origins unless allowMountedOrigin is set", async () => {
  let calls = 0;
  await expectPolicyFailure(
    () =>
      fetchLiveSafe("http://127.0.0.1:43123/partial", {
        fetchImpl: async () => {
          calls += 1;
          return mockResponse({ url: "http://127.0.0.1:43123/partial" }).response;
        },
      }),
    /live-safe allowlist rejected url/,
  );
  assert.equal(calls, 0);

  const allowed = await fetchLiveSafe("http://127.0.0.1:43123/partial", {
    allowMountedOrigin: true,
    fetchImpl: async () =>
      mockResponse({
        url: "http://127.0.0.1:43123/partial",
        text: "<title>mounted</title>",
      }).response,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.finalUrl, "http://127.0.0.1:43123/partial");
});

test("fetchLiveSafe refuses declared bodies over 1MiB without reading them", async () => {
  let readerCreated = false;
  let textReads = 0;
  await expectPolicyFailure(
    () =>
      fetchLiveSafe("https://example.com/", {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          url: "https://example.com/",
          headers: headerMap({ "content-length": String(MAX_BYTES + 1) }),
          body: {
            getReader() {
              readerCreated = true;
              return {
                async read() {
                  return { done: true, value: undefined };
                },
                async cancel() {},
                releaseLock() {},
              };
            },
          },
          text: async () => {
            textReads += 1;
            return "oversized";
          },
        }),
      }),
    /response exceeds 1048576 byte limit/,
  );
  assert.equal(readerCreated, false);
  assert.equal(textReads, 0);
});

test("fetchLiveSafe enforces the 1MiB bound on the streamed body and cancels the reader", async () => {
  const first = new Uint8Array(MAX_BYTES);
  const rest = new Uint8Array(64 * 1024);
  first.fill(97);
  rest.fill(98);
  const { body, state } = streamBody([first, rest]);

  await expectPolicyFailure(
    () =>
      fetchLiveSafe("https://example.com/", {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          url: "https://example.com/",
          headers: headerMap({}),
          body,
          text: async () => {
            throw new Error("text() must not run when a stream body exists");
          },
        }),
      }),
    /response exceeds 1048576 byte limit/,
  );

  assert.equal(state.reads, 2);
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
  assert.equal(state.index, 2);
});

test("fetchLiveSafe accepts a streamed body of exactly 1MiB", async () => {
  const exact = new Uint8Array(MAX_BYTES);
  exact.fill(97);
  const { body, state } = streamBody([exact]);
  const page = await fetchLiveSafe("https://example.com/", {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://example.com/",
      headers: headerMap({ "content-length": String(MAX_BYTES) }),
      body,
      text: async () => {
        throw new Error("text() must not run when a stream body exists");
      },
    }),
  });
  assert.equal(page.ok, true);
  assert.equal(page.bytes, MAX_BYTES);
  assert.equal(page.text.length, MAX_BYTES);
  assert.equal(state.cancelled, false);
  assert.equal(state.released, true);
});

test("policy failures are non-retryable through withRetries and recipe observe", async () => {
  const cases = [
    {
      name: "redirect",
      fetchImpl: async () =>
        mockResponse({
          status: 302,
          url: "https://example.com/",
          headers: { location: "https://evil.example/" },
          text: "<title>nope</title>",
        }).response,
      pattern: /redirects are not followed/,
    },
    {
      name: "final-url",
      fetchImpl: async () =>
        mockResponse({
          status: 200,
          url: "https://attacker.example/",
          text: "<title>nope</title>",
        }).response,
      pattern: /rejected final url/,
    },
    {
      name: "oversize",
      fetchImpl: async () =>
        mockResponse({
          status: 200,
          url: "https://example.com/",
          headers: { "content-length": String(MAX_BYTES + 1) },
          text: "oversized",
        }).response,
      pattern: /1048576 byte limit/,
    },
  ];

  for (const item of cases) {
    let calls = 0;
    const wrapped = await withRetries(
      async () => {
        calls += 1;
        return fetchLiveSafe("https://example.com/", {
          fetchImpl: async (...args) => item.fetchImpl(...args),
        });
      },
      { retries: 2, delayMs: 0, shouldRetry: (error) => error.retryable !== false },
    );
    assert.equal(wrapped.ok, false, item.name);
    assert.equal(calls, 1, item.name);
    assert.equal(wrapped.attempts.length, 1, item.name);
    assert.equal(wrapped.attempts[0].retryable, false, item.name);
    assert.match(wrapped.error.message, item.pattern);

    let recipeCalls = 0;
    const result = await sourceChangeWithFetch(async (...args) => {
      recipeCalls += 1;
      return item.fetchImpl(...args);
    });
    assert.equal(result.outcome, "error", item.name);
    assert.equal(recipeCalls, 1, item.name);
    assert.equal(result.evidence.attempts[0].retryable, false, item.name);
    assert.match(result.evidence.message, item.pattern);
  }

  let allowlistCalls = 0;
  const blocked = await sourceChangeWithFetch(
    async () => {
      allowlistCalls += 1;
      return mockResponse().response;
    },
    { liveUrl: "https://not-example.com/" },
  );
  assert.equal(blocked.outcome, "error");
  assert.equal(allowlistCalls, 0);
  assert.equal(blocked.evidence.attempts[0].retryable, false);
  assert.match(blocked.evidence.message, /rejected url/);
});

test("transient 503 remains retryable unlike policy failures", async () => {
  let calls = 0;
  const result = await sourceChangeWithFetch(async () => {
    calls += 1;
    return mockResponse({
      status: 503,
      url: "https://example.com/",
      text: "temporary",
    }).response;
  });
  assert.equal(result.outcome, "error");
  assert.equal(calls, 3);
  assert.equal(result.evidence.attempts.length, 3);
  assert.equal(result.evidence.attempts.every((row) => row.retryable === true), true);
});

test("extractComparableFields treats blank title and h1 as missing", () => {
  assert.deepEqual(extractComparableFields("<title>Example Domain</title><h1>Example Domain</h1>", ["title", "h1"]), {
    title: "Example Domain",
    h1: "Example Domain",
  });
  assert.deepEqual(extractComparableFields("<title></title><h1>   </h1>", ["title", "h1"]), {
    title: null,
    h1: null,
  });
  assert.deepEqual(extractComparableFields("<p>no tags</p>", ["title", "h1"]), {
    title: null,
    h1: null,
  });
});

test("comparable-record-extraction keeps partial rows and surfaces all-missing as empty_extract", async () => {
  const mixed = await runRecipe("comparable-record-extraction", {
    priorPath: prior("record-extract.prior.json"),
    sources: [
      { kind: "fixture", path: page("example-a.html"), sourceKey: "fixtures/pages/example-a.html" },
      { kind: "fixture", path: page("example-b-partial.html"), sourceKey: "fixtures/pages/example-b-partial.html" },
      { kind: "fixture", path: page("example-all-missing.html"), sourceKey: "fixtures/pages/example-all-missing.html" },
      { kind: "fixture", path: page("example-empty.html"), sourceKey: "fixtures/pages/example-empty.html" },
    ],
    fields: ["title", "h1"],
    scheduleHint: "weekly",
    clock: "2026-09-09T15:00:00.000Z",
  });

  assert.equal(mixed.outcome, "partial");
  assert.equal(mixed.ok, true);
  assert.equal(mixed.recovery.action, "keep_partial_rows");
  assert.equal(mixed.evidence.summary.total, 4);
  assert.equal(mixed.evidence.summary.success, 2);
  assert.equal(mixed.evidence.summary.failure, 2);

  const byKey = Object.fromEntries(mixed.evidence.rows.map((row) => [row.sourceKey, row]));
  assert.equal(byKey["fixtures/pages/example-a.html"].status, "success");
  assert.equal(byKey["fixtures/pages/example-a.html"].partial, false);
  assert.deepEqual(byKey["fixtures/pages/example-a.html"].missing, []);

  assert.equal(byKey["fixtures/pages/example-b-partial.html"].status, "success");
  assert.equal(byKey["fixtures/pages/example-b-partial.html"].partial, true);
  assert.deepEqual(byKey["fixtures/pages/example-b-partial.html"].missing, ["h1"]);

  assert.equal(byKey["fixtures/pages/example-all-missing.html"].status, "failure");
  assert.equal(byKey["fixtures/pages/example-all-missing.html"].partial, false);
  assert.deepEqual(byKey["fixtures/pages/example-all-missing.html"].missing, ["title", "h1"]);
  assert.equal(byKey["fixtures/pages/example-all-missing.html"].error.code, "empty_extract");

  assert.equal(byKey["fixtures/pages/example-empty.html"].status, "failure");
  assert.equal(byKey["fixtures/pages/example-empty.html"].error.code, "empty_extract");
  assert.deepEqual(byKey["fixtures/pages/example-empty.html"].missing, ["title", "h1"]);
});

test("all-missing-only comparable extraction is an error, not silent success", async () => {
  const result = await runRecipe("comparable-record-extraction", {
    priorPath: prior("record-extract.prior.json"),
    sources: [
      { kind: "fixture", path: page("example-all-missing.html"), sourceKey: "all-missing" },
      { kind: "fixture", path: page("example-empty.html"), sourceKey: "empty" },
    ],
    fields: ["title", "h1"],
    clock: "2026-09-09T15:00:00.000Z",
  });
  assert.equal(result.outcome, "error");
  assert.equal(result.ok, false);
  assert.equal(result.evidence.summary.success, 0);
  assert.equal(result.evidence.summary.failure, 2);
  assert.equal(result.evidence.rows.every((row) => row.error?.code === "empty_extract"), true);
});

test("live-safe all-missing and live-safe partial rows stay classified", async () => {
  const pagesByUrl = {
    "https://example.com/": "<html><body><p>no selected fields</p></body></html>",
    "http://127.0.0.1:43123/partial": "<title>one field</title>",
  };

  const allMissing = await runRecipe("comparable-record-extraction", {
    priorPath: prior("record-extract.prior.json"),
    liveSafe: true,
    sources: [{ kind: "live_safe", url: "https://example.com/" }],
    fields: ["title", "h1"],
    clock: "2026-09-09T15:00:00.000Z",
    fetchImpl: async (url) =>
      mockResponse({
        url,
        text: pagesByUrl[url],
      }).response,
  });
  assert.equal(allMissing.outcome, "error");
  assert.equal(allMissing.evidence.rows[0].status, "failure");
  assert.deepEqual(allMissing.evidence.rows[0].missing, ["title", "h1"]);
  assert.equal(allMissing.evidence.rows[0].error.code, "empty_extract");

  const partial = await runRecipe("comparable-record-extraction", {
    priorPath: prior("record-extract.prior.json"),
    liveSafe: true,
    allowMountedOrigin: true,
    sources: [
      { kind: "live_safe", url: "http://127.0.0.1:43123/partial" },
      { kind: "live_safe", url: "https://example.com/" },
    ],
    fields: ["title", "h1"],
    clock: "2026-09-09T15:00:00.000Z",
    fetchImpl: async (url) =>
      mockResponse({
        url,
        text: pagesByUrl[url],
      }).response,
  });
  assert.equal(partial.outcome, "partial");
  assert.equal(partial.evidence.summary.success, 1);
  assert.equal(partial.evidence.summary.failure, 1);
  assert.equal(partial.evidence.rows[0].partial, true);
  assert.deepEqual(partial.evidence.rows[0].missing, ["h1"]);
  assert.equal(partial.evidence.rows[1].error.code, "empty_extract");
});
