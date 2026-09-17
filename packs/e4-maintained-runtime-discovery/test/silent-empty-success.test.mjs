import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { discoverOffer } from "../src/discover.mjs";
import { parseDiscoveryDocument } from "../src/parse-offer.mjs";
import { FIXTURES, runDiscover, parseStdout } from "./helpers.mjs";

function naiveAccept(raw, httpStatus = 200) {
  if (httpStatus >= 200 && httpStatus < 300) {
    const data = raw.trim() === "" ? {} : JSON.parse(raw);
    return { ok: true, data };
  }
  return { ok: false };
}

test("seeded silent-empty-success fixture is rejected with that class", async () => {
  const path = join(FIXTURES, "silent-empty-success.json");
  const result = await discoverOffer({ mode: "fixture", fixturePath: path });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.failure.class, "silent_empty_success");
  assert.equal(result.failure.seeded, "silent_empty_success");
  assert.equal(result.offer, undefined);
});

test("CLI --fixture silent-empty-success.json exits 2 and names the class", () => {
  const proc = runDiscover([
    "--fixture",
    "packs/e4-maintained-runtime-discovery/fixtures/silent-empty-success.json",
  ]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "silent_empty_success");
  assert.notEqual(json.ok, true);
});

test("naive 2xx-is-success would accept the seeded fixture; this client does not", async () => {
  const { readFileSync } = await import("node:fs");
  const raw = readFileSync(join(FIXTURES, "silent-empty-success.json"), "utf8");
  const naive = naiveAccept(raw, 200);
  assert.equal(naive.ok, true);
  assert.equal(naive.data.ok, true);
  assert.deepEqual(naive.data.jobs, []);
  const parsed = parseDiscoveryDocument(raw, { httpStatus: 200, source: "seeded" });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "silent_empty_success");
});

test("empty object, {ok:true}, and empty body are silent_empty_success", async () => {
  const cases = [
    ["silent-empty-object.json", 200],
    ["silent-empty-ok.json", 200],
    ["empty-body.txt", 200],
  ];
  for (const [name] of cases) {
    const result = await discoverOffer({
      mode: "fixture",
      fixturePath: join(FIXTURES, name),
    });
    assert.equal(result.ok, false, name);
    assert.equal(result.failure.class, "silent_empty_success", name);
  }
});

test("parseDiscoveryDocument treats whitespace-only 2xx as silent_empty_success", () => {
  const parsed = parseDiscoveryDocument("   \n", { httpStatus: 200 });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "silent_empty_success");
});

test("CLI never exits 0 for the seeded empty success", () => {
  const proc = runDiscover([
    "--compact",
    "--fixture",
    "packs/e4-maintained-runtime-discovery/fixtures/silent-empty-success.json",
  ]);
  assert.notEqual(proc.status, 0);
  assert.equal(proc.status, 2);
  assert.match(proc.stdout, /"ok":\s*false/);
  assert.match(proc.stdout, /silent_empty_success/);
});

test("live GET 200 with ok:true and empty jobs is silent_empty_success", async () => {
  const result = await discoverOffer({
    mode: "live",
    fetchImpl: async (url) => {
      if (String(url).includes("/discovery/useful-jobs.json")) {
        return new Response(JSON.stringify({ ok: true, schema: "samedaydesk.for-agents.useful-jobs.v1", package: "useful-jobs", jobs: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("missing", { status: 404 });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "silent_empty_success");
});
