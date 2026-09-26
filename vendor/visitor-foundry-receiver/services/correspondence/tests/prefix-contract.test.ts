import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertHttpsOrLoopback, createTrial, issueGrant, status } from "../bin/pilot-trial.mjs";
import { boundedApi, canonicalOperatorOrigin } from "../bin/safe-io.mjs";
import { assertCorrespondenceOrigin } from "../../../scripts/correspondence/client.mjs";

const ADMIN = "admin-token-long-enough-for-tests";
const OWNER = "neo_own_owner-token-long-enough-for-tests";
const PREFIX = "https://samedaydesk.example/api/correspondence";

function privateFile(path: string, contents: string) {
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

test("canonical service address keeps a configured prefix and rejects silent rebinds", () => {
  assert.equal(canonicalOperatorOrigin("https://correspondence.example"), "https://correspondence.example");
  assert.equal(canonicalOperatorOrigin(`${PREFIX}/`), PREFIX);
  assert.equal(canonicalOperatorOrigin("http://127.0.0.1:8787/api/correspondence"), "http://127.0.0.1:8787/api/correspondence");
  assert.throws(() => canonicalOperatorOrigin("https://host.example/api/correspondence?x=1"));
  assert.throws(() => canonicalOperatorOrigin("https://user:pass@host.example/api/correspondence"));
  assert.throws(() => canonicalOperatorOrigin("https://host.example/api/correspondence#frag"));
  assert.throws(() => canonicalOperatorOrigin("https://host.example/api/corr espondence"));
  assert.equal(assertCorrespondenceOrigin(`${PREFIX}/`), PREFIX);
  assert.notEqual(canonicalOperatorOrigin(PREFIX), canonicalOperatorOrigin("https://samedaydesk.example"));
});

test("boundedApi concatenates /v1 onto the prefixed base URL", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await boundedApi(PREFIX, "POST", "/v1/projects", {
    token: ADMIN,
    body: { title: "Prefixed", summary: "Keep the mount path" },
    idempotencyKey: "prefix-key-1",
    fetchImpl,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [`${PREFIX}/v1/projects`]);
});

test("saved prefix is checked before an owner secret can be read or transmitted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-prefix-"));
  const stateFile = join(dir, "trial.json");
  privateFile(
    stateFile,
    `${JSON.stringify({
      schema: "neomorphic.correspondence.trial-state.v1",
      phase: "active",
      baseUrl: PREFIX,
      projectId: "project-1",
      ownerTokenFile: join(dir, "deliberately-missing-owner.token"),
    })}\n`,
  );
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("must not fetch");
  };
  try {
    await assert.rejects(
      issueGrant({ "base-url": "https://samedaydesk.example", "state-file": stateFile, role: "writer" }),
      /does not match the saved trial origin/,
    );
    await assert.rejects(
      issueGrant({
        "base-url": "https://samedaydesk.example/api/other",
        "state-file": stateFile,
        role: "writer",
      }),
      /does not match the saved trial origin/,
    );
    await assert.rejects(
      status({ "base-url": "https://samedaydesk.example", "state-file": stateFile }),
      /does not match the saved trial origin/,
    );
    assert.equal(fetched, false);
    assert.equal(assertHttpsOrLoopback(PREFIX), PREFIX);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("create-trial persists the prefixed address as the immutable service address", async () => {
  const dir = mkdtempSync(join(tmpdir(), "correspondence-prefix-create-"));
  const stateFile = join(dir, "trial.json");
  const ownerTokenFile = join(dir, "owner.token");
  const adminTokenFile = join(dir, "admin.token");
  privateFile(adminTokenFile, `${ADMIN}\n`);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ project: { id: "project-prefix", version: 1, status: "open" }, ownerToken: OWNER }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };
  try {
    await createTrial({
      "base-url": PREFIX,
      "admin-token-file": adminTokenFile,
      "state-file": stateFile,
      "owner-token-file": ownerTokenFile,
      title: "Prefixed trial",
      summary: "Immutable address includes the mount path.",
    });
    const active = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(active.baseUrl, PREFIX);
    assert.deepEqual(calls, [`${PREFIX}/v1/projects`]);
    await assert.rejects(
      createTrial({
        "base-url": "https://samedaydesk.example",
        "admin-token-file": adminTokenFile,
        "state-file": stateFile,
        "owner-token-file": ownerTokenFile,
      }),
      /does not match the saved trial origin/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
