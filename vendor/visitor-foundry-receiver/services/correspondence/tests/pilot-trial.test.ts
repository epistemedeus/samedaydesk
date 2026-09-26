import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The operator tools are intentionally plain Node ESM rather than part of src/ compilation.
// @ts-expect-error no declaration file is shipped for the CLI module
import { createTrial, issueGrant, status, assertHttpsOrLoopback } from "../bin/pilot-trial.mjs";
// @ts-expect-error no declaration file is shipped for the CLI helper module
import { boundedApi, publicApiError } from "../bin/safe-io.mjs";

const BASE = "https://correspondence.example";
const ADMIN = "admin-token-long-enough-for-tests";
const OWNER = "neo_own_owner-token-long-enough-for-tests";
const WRITER = "neo_write_writer-token-long-enough-for-tests";

function privateFile(path: string, contents: string) {
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function jsonResponse(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("create-trial persists immutable intent before POST and reuses it after a lost response", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-create-"));
  const stateFile = join(dir, "trial.json");
  const ownerTokenFile = join(dir, "owner.token");
  const adminTokenFile = join(dir, "admin.token");
  privateFile(adminTokenFile, `${ADMIN}\n`);
  const calls: Array<{ url: string; key: string | null; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      key: new Headers(init?.headers).get("idempotency-key"),
      body: String(init?.body),
    });
    if (calls.length === 1) throw new Error("connection ended after server commit");
    return jsonResponse(
      { project: { id: "project-1", version: 1, status: "open" }, ownerToken: OWNER },
      200,
    );
  };
  try {
    const options = {
      "base-url": BASE,
      "admin-token-file": adminTokenFile,
      "state-file": stateFile,
      "owner-token-file": ownerTokenFile,
      title: "Immutable trial",
      summary: "One request intent across recovery.",
    };
    await assert.rejects(createTrial(options), /connection ended after server commit/);
    const pending = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(pending.phase, "pending_project");
    assert.equal(pending.baseUrl, BASE);
    assert.ok(pending.idempotencyKey);

    await createTrial(options);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], calls[0]);
    const active = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(active.phase, "active");
    assert.equal(active.projectId, "project-1");
    assert.equal(readFileSync(ownerTokenFile, "utf8").trim(), OWNER);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("create-trial lock prevents concurrent duplicate POSTs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-lock-"));
  const adminTokenFile = join(dir, "admin.token");
  privateFile(adminTokenFile, `${ADMIN}\n`);
  let release!: () => void;
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    started();
    await wait;
    return jsonResponse(
      { project: { id: "project-locked", version: 1, status: "open" }, ownerToken: OWNER },
      201,
    );
  };
  const options = {
    "base-url": BASE,
    "admin-token-file": adminTokenFile,
    "state-file": join(dir, "trial.json"),
    "owner-token-file": join(dir, "owner.token"),
  };
  try {
    const first = createTrial(options);
    await didStart;
    await assert.rejects(createTrial(options), /another operator command holds the lock/);
    release();
    await first;
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saved origin is checked before an owner secret can be read or transmitted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-origin-"));
  const stateFile = join(dir, "trial.json");
  privateFile(stateFile, `${JSON.stringify({
    schema: "neomorphic.correspondence.trial-state.v1",
    phase: "active",
    baseUrl: BASE,
    projectId: "project-1",
    ownerTokenFile: join(dir, "deliberately-missing-owner.token"),
  })}\n`);
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("must not fetch");
  };
  try {
    await assert.rejects(
      issueGrant({ "base-url": "https://wrong.example", "state-file": stateFile, role: "writer" }),
      /does not match the saved trial origin/,
    );
    await assert.rejects(
      status({ "base-url": "https://wrong.example", "state-file": stateFile }),
      /does not match the saved trial origin/,
    );
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown grant outcome is not retried into a duplicate grant", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-grant-"));
  const stateFile = join(dir, "trial.json");
  const ownerTokenFile = join(dir, "owner.token");
  const output = join(dir, "writer.token");
  const legacyOutput = join(dir, "legacy-writer.token");
  const danglingOutput = join(dir, "dangling-writer.token");
  privateFile(ownerTokenFile, `${OWNER}\n`);
  privateFile(legacyOutput, `${WRITER}\n`);
  symlinkSync(join(dir, "missing-writer.token"), danglingOutput);
  privateFile(stateFile, `${JSON.stringify({
    schema: "neomorphic.correspondence.trial-state.v1",
    phase: "active",
    baseUrl: BASE,
    projectId: "project-1",
    ownerTokenFile,
  })}\n`);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("response lost after grant creation");
  };
  const options = { "base-url": BASE, "state-file": stateFile, role: "writer", "out-token-file": output };
  try {
    await assert.rejects(
      issueGrant({ ...options, "out-token-file": legacyOutput }),
      /already exists without a matching grant intent/,
    );
    await assert.rejects(
      issueGrant({ ...options, "out-token-file": danglingOutput }),
      /refusing symlink path/,
    );
    assert.equal(calls, 0);
    await assert.rejects(issueGrant(options), /response lost after grant creation/);
    await assert.rejects(issueGrant(options), /grant outcome is unknown/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("private-file and HTTP boundaries reject symlinks, unsafe URLs, oversized and arbitrary bodies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-boundary-"));
  const realAdmin = join(dir, "real-admin.token");
  const linkedAdmin = join(dir, "linked-admin.token");
  const danglingAdmin = join(dir, "dangling-admin.token");
  const publicAdmin = join(dir, "public-admin.token");
  privateFile(realAdmin, `${ADMIN}\n`);
  symlinkSync(realAdmin, linkedAdmin);
  symlinkSync(join(dir, "missing-target.token"), danglingAdmin);
  writeFileSync(publicAdmin, `${ADMIN}\n`, { mode: 0o644 });
  chmodSync(publicAdmin, 0o644);
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return jsonResponse({}, 500);
  };
  try {
    await assert.rejects(createTrial({
      "base-url": BASE,
      "admin-token-file": linkedAdmin,
      "state-file": join(dir, "trial.json"),
      "owner-token-file": join(dir, "owner.token"),
    }), /refusing symlink path/);
    await assert.rejects(createTrial({
      "base-url": BASE,
      "admin-token-file": publicAdmin,
      "state-file": join(dir, "public-trial.json"),
      "owner-token-file": join(dir, "public-owner.token"),
    }), /permissions must be 0600/);
    await assert.rejects(createTrial({
      "base-url": BASE,
      "admin-token-file": danglingAdmin,
      "state-file": join(dir, "dangling-trial.json"),
      "owner-token-file": join(dir, "dangling-owner.token"),
    }), /refusing symlink path/);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(assertHttpsOrLoopback("https://example.test/api"), "https://example.test/api");
  assert.throws(() => assertHttpsOrLoopback("https://example.test/api?x=1"), /canonical origin/);
  await assert.rejects(
    boundedApi(BASE, "GET", "/large", {
      fetchImpl: async () => new Response("x".repeat(65 * 1024), { status: 500 }),
    }),
    /response exceeded/,
  );
  await assert.rejects(
    boundedApi(BASE, "GET", "/slow", {
      timeoutMs: 5,
      fetchImpl: async (_input: unknown, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    }),
    /request timed out after 5ms/,
  );
  const invalid = await boundedApi(BASE, "GET", "/html", {
    fetchImpl: async () => new Response(`<html>${WRITER}</html>`, { status: 500 }),
  });
  assert.deepEqual(publicApiError(invalid), {
    code: "invalid_response",
    message: "server returned a non-JSON response",
  });
});
