import test from "node:test";
import assert from "node:assert/strict";
import { CODE } from "../src/constants.mjs";
import { createHttpAdapter } from "../src/adapters/http.mjs";
import { openAdapter } from "../src/adapters/index.mjs";

function mockFetch(handler) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const result = handler(parsed, init);
    const body = JSON.stringify(result.body);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      async text() {
        return body;
      },
    };
  };
}

test("HTTP browse uses public GET and never an owner bearer", async () => {
  const calls = [];
  const adapter = createHttpAdapter({
    origin: "http://127.0.0.1:8791",
    fetchImpl: mockFetch((url, init) => {
      calls.push({ url: url.pathname, auth: init.headers.authorization || null, method: init.method });
      return { status: 200, body: { tasks: [{ id: "tsk_remote", lifecycle: "open" }] } };
    }),
  });
  const browse = await adapter.browse();
  assert.equal(browse.tasks[0].id, "tsk_remote");
  assert.equal(calls[0].auth, null);
  assert.equal(calls[0].url, "/v1/tasks");
});

test("HTTP claim refuses to mint a contributor token with an owner secret", async () => {
  assert.throws(
    () =>
      openAdapter({
        kind: "http",
        origin: "http://127.0.0.1:8791",
        env: { EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275" },
      }),
    (error) => error.code === CODE.DESK_HOLDS_EARNED_WORK_SECRET,
  );
});

test("HTTP owed-versus-paid does not call owner /payout", async () => {
  const calls = [];
  const adapter = createHttpAdapter({
    origin: "http://127.0.0.1:8791",
    fetchImpl: mockFetch((url, init) => {
      calls.push(url.pathname);
      if (url.pathname.endsWith("/payout")) {
        return { status: 401, body: { error: { code: "unauthorized" } } };
      }
      return {
        status: 200,
        body: { task: { id: "tsk_remote", lifecycle: "accepted", payoutState: "owed" } },
      };
    }),
  });
  const view = await adapter.owedVersusPaid({ taskId: "tsk_remote" });
  assert.equal(view.owed, true);
  assert.equal(view.paid, false);
  assert.equal(view.settled, false);
  assert.equal(calls.includes("/v1/tasks/tsk_remote/payout"), false);
});

test("HTTP appeal is not mapped onto owner accept", async () => {
  const adapter = createHttpAdapter({ origin: "http://127.0.0.1:8791", fetchImpl: mockFetch(() => ({ status: 200, body: {} })) });
  await assert.rejects(() => adapter.appeal({ taskId: "x", contributorPublicId: "y", reason: "please reverse" }), (error) => {
    return error.code === CODE.APPEAL_UNSUPPORTED_ON_ORIGIN;
  });
});

test("HTTP adapter refuses non-http origins and embedded credentials", () => {
  assert.throws(
    () => createHttpAdapter({ origin: "file:///etc/passwd" }),
    (error) => error.code === CODE.ADAPTER_REFUSED && /protocol/.test(error.message),
  );
  assert.throws(
    () => createHttpAdapter({ origin: "http://user:secret@127.0.0.1:8791" }),
    (error) => error.code === CODE.ADAPTER_REFUSED && /credential/.test(error.message),
  );
});

test("HTTP fetch does not follow redirects, times out, and pins paid/settled", async () => {
  const calls = [];
  const adapter = createHttpAdapter({
    origin: "http://127.0.0.1:8791",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), redirect: init.redirect, hasSignal: Boolean(init.signal) });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            task: { id: "tsk_remote", paid: true, settled: true, transfer: { hash: "0x1" }, payoutState: "owed" },
          });
        },
      };
    },
  });
  const status = await adapter.status({ taskId: "tsk_remote" });
  assert.equal(status.paid, false);
  assert.equal(status.settled, false);
  assert.equal(status.transfer, null);
  assert.equal(calls[0].redirect, "manual");
  assert.equal(calls[0].hasSignal, true);
});

test("HTTP adapter refuses 3xx redirects instead of following them to owner routes", async () => {
  const adapter = createHttpAdapter({
    origin: "http://127.0.0.1:8791",
    fetchImpl: async () => ({
      ok: false,
      status: 302,
      redirected: false,
      async text() {
        return "";
      },
    }),
  });
  await assert.rejects(
    () => adapter.browse(),
    (error) => error.code === CODE.ADAPTER_REFUSED && /redirect/i.test(error.message),
  );
});

test("HTTP claim refuses a wallet field", async () => {
  const adapter = createHttpAdapter({
    origin: "http://127.0.0.1:8791",
    contributorToken: "ctr_session",
    fetchImpl: mockFetch(() => ({ status: 200, body: {} })),
  });
  await assert.rejects(
    () => adapter.claim({ taskId: "tsk_remote", contributorPublicId: "ctr_walrus", wallet: "0xabc" }),
    (error) => error.code === CODE.NOT_WALLETLESS,
  );
});

test("HTTP adapter refuses an oversized origin body", async () => {
  const adapter = createHttpAdapter({
    origin: "http://127.0.0.1:8791",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(2_000_000) },
      async text() {
        return "{}";
      },
    }),
  });
  await assert.rejects(
    () => adapter.browse(),
    (error) => error.code === CODE.ADAPTER_REFUSED && error.status === 413,
  );
});
