import assert from "node:assert/strict";
import test from "node:test";
import { discoverOffer } from "../src/discover.mjs";
import { SURFACES } from "../src/surfaces.mjs";
import { parseStdout, runDiscover } from "./helpers.mjs";

const skipLive = process.env.SKIP_LIVE_E4 === "1";

test(
  "live maintained client discovers the useful-jobs offer at the existing URL",
  { skip: skipLive ? "SKIP_LIVE_E4=1" : false },
  async () => {
    const result = await discoverOffer({ mode: "live" });
    assert.equal(result.ok, true, JSON.stringify(result.failure || result, null, 2));
    assert.equal(result.mode, "live");
    assert.equal(result.offer.package, "useful-jobs");
    assert.equal(result.offer.version, "1.4.7");
    assert.ok(result.offer.jobs.includes("lockfile-pin-delta"));
    assert.equal(result.offer.jobs.length, 10);
    assert.equal(result.offer.archive.bytes, 5255824);
    assert.equal(result.surfaces.discovery.url, SURFACES.discovery.url);
    assert.equal(result.llms.pointerFound, true);
  },
);

test(
  "CLI --live exits 0 against the real discovery URL",
  { skip: skipLive ? "SKIP_LIVE_E4=1" : false },
  () => {
    const proc = runDiscover(["--live"]);
    const { json } = parseStdout(proc);
    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.offer.package, "useful-jobs");
    assert.equal(json.offer.jobs.length, 10);
  },
);
