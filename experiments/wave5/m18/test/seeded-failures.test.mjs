import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SDS_ROOT } from "../lib/pins.mjs";
import { spawnPageChange } from "../lib/spawn-engine.mjs";
import { engine, spawnTrial, tmpOut } from "./helpers.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("live HTTP URL input is a valid refusal and the server is not contacted", async () => {
  const beforePath = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/before.json");
  const afterPath = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/after.json");
  const hits = [];
  const server = createServer((_req, res) => {
    hits.push(1);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(readFileSync(beforePath));
  });
  const address = await listen(server);
  try {
    const url = `http://127.0.0.1:${address.port}/before.json`;
    const spawned = spawnPageChange({
      cli: engine().cli,
      args: [
        "compare",
        "--before", url,
        "--after", afterPath,
        "--fields", "title",
        "--clock", "2026-09-11T18:00:00.000Z",
        "--out-dir", tmpOut("m18-live-"),
      ],
    });
    assert.equal(spawned.kind, "valid_refusal");
    assert.equal(spawned.code, "live_fetch_url");
    assert.equal(hits.length, 0);
  } finally {
    await close(server);
  }
});

test("missing clock is a valid refusal, not a successful compare", () => {
  const before = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/before.json");
  const after = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/after.json");
  const spawned = spawnPageChange({
    cli: engine().cli,
    args: [
      "compare",
      "--before", before,
      "--after", after,
      "--fields", "title",
      "--out-dir", tmpOut("m18-noclock-"),
    ],
  });
  assert.equal(spawned.kind, "valid_refusal");
  assert.equal(spawned.code, "clock_required");
});

test("SAMPLE --example is a valid refusal, not a delivered watch", () => {
  const before = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/before.json");
  const after = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/after.json");
  const spawned = spawnPageChange({
    cli: engine().cli,
    args: [
      "compare",
      "--before", before,
      "--after", after,
      "--fields", "title",
      "--clock", "2026-09-11T18:00:00.000Z",
      "--example",
      "--out-dir", tmpOut("m18-sample-"),
    ],
  });
  assert.equal(spawned.kind, "valid_refusal");
  assert.equal(spawned.code, "sample_as_delivered_watch");
});

test("missing engine root is a transport failure, not a passing skip", () => {
  const spawned = spawnTrial(
    ["run", "--case", "complete-changed", "--out-dir", tmpOut("m18-noengine-")],
    { PAGE_CHANGE_ENGINE_ROOT: join(SDS_ROOT, "experiments/wave5/m18/does-not-exist") },
  );
  assert.notEqual(spawned.status, 0);
  const err = JSON.parse(String(spawned.stderr).trim().split("\n")[0]);
  assert.equal(err.code, "engine_unavailable");
});

test("unknown case is usage, not a green skip", () => {
  const spawned = spawnTrial(["run", "--case", "not-a-case", "--out-dir", tmpOut("m18-unknown-")]);
  assert.equal(spawned.status, 2);
  const err = JSON.parse(String(spawned.stderr).trim().split("\n")[0]);
  assert.equal(err.code, "usage");
});
