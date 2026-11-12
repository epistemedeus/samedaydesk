import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { artifactDigests } from "../src/artifacts.mjs";
import { readJson, readText } from "./helpers.mjs";

const obs = readJson("OBSERVATIONS.json");

describe("actual-provider observations are kept apart from fixtures", () => {
  test("this kit's artifacts are fixture only with an unreceived provider import", () => {
    const digests = artifactDigests();
    for (const name of ["make", "n8n"]) {
      assert.equal(obs.thisKit[name].providerImport, "unsupported_unreceived");
      assert.equal(obs.thisKit[name].evidence, "fixture_only");
      assert.equal(obs.thisKit[name].sha256, digests[name].sha256);
      assert.equal(obs.thisKit[name].bytes, digests[name].bytes);
    }
  });

  test("the only received provider observation is the earlier n8n QA import, not executed", () => {
    const received = obs.actualProvider.filter((o) => o.status !== "unreceived");
    assert.equal(received.length, 1);
    assert.equal(received[0].provider, "n8n Cloud");
    assert.equal(received[0].executed, false);
    assert.equal(received[0].scope, "earlier kit, not this one");
    assert.equal(received[0].artifact.sha256, "4a7d556b9720a64637bb1811b48284035a37a2f063961d7351559bdba694362b");
    assert.notEqual(received[0].artifact.sha256, obs.thisKit.n8n.sha256);
    assert.equal(obs.actualProvider.find((o) => o.provider === "Make").status, "unreceived");
    assert.equal(obs.fixtureObservations.notProvider, true);
  });

  test("OBSERVATIONS.md says the same thing", () => {
    const md = readText("OBSERVATIONS.md");
    assert.match(md, /`n8n\/changed-period\.workflow\.json` \| unsupported, unreceived \| fixture only/);
    assert.match(md, /`make\/changed-period\.blueprint\.json` \| unsupported, unreceived \| fixture only/);
    assert.match(md, /Nothing was executed/);
    assert.match(md, /not paid or commercial/);
  });
});
