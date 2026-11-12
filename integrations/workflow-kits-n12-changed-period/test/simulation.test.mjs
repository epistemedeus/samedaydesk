import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createChangedPeriodEndpoint } from "../src/client-endpoint.mjs";
import { SCENARIO_CLOCK, periodNPlus1Request, periodNRequest } from "../src/fixtures.mjs";
import { simulateMake, simulateN8n } from "../src/simulate.mjs";
import { ROUTES, runScenario, artifacts } from "../src/scenario.mjs";
import { clone } from "./helpers.mjs";

const set = artifacts();
const sims = { make: (body, endpoint) => simulateMake(set.make, { body, endpoint }), n8n: (body, endpoint) => simulateN8n(set.n8n, { body, endpoint }) };

describe("executable simulation of both recipes", () => {
  for (const platform of ["make", "n8n"]) {
    test(`${platform}: the replay route runs for an uncommitted record and applies it once`, () => {
      const endpoint = createChangedPeriodEndpoint({ clock: SCENARIO_CLOCK, faults: [{ type: "uncommitted", periodId: "period-N+1", recordKey: "r-002" }] });
      assert.equal(sims[platform](periodNRequest(), endpoint).status, "success");
      const run = sims[platform](periodNPlus1Request({ stale: false }), endpoint);
      assert.equal(run.status, "success");
      assert.equal(run.response.code, 200);
      const replays = run.httpCalls.filter((c) => c.url.endsWith("/replay"));
      assert.equal(replays.length, 1);
      const applies = run.httpCalls.filter((c) => c.url.endsWith("/apply"));
      assert.equal(applies.length, 4);
      assert.ok(applies.every((c) => c.status === 201));
      assert.equal(endpoint.receipts.forPeriodRecord("period-N+1", "r-002").applyCount, 1);
      assert.equal(endpoint.externalEffects(), 7);
    });

    test(`${platform}: an invalid mapping in the artifact answers 422 with the config errors and applies nothing`, () => {
      const endpoint = createChangedPeriodEndpoint({ clock: SCENARIO_CLOCK });
      const broken = clone(set[platform]);
      const bad = JSON.stringify({ schema: "wrong", versions: [] });
      if (platform === "n8n") broken.nodes.find((n) => n.name === "Period Mappings").parameters.assignments.assignments[0].value = bad;
      else broken.flow[1].mapper.value = bad;
      const run = platform === "n8n" ? simulateN8n(broken, { body: periodNRequest(), endpoint }) : simulateMake(broken, { body: periodNRequest(), endpoint });
      assert.equal(run.status, "success");
      assert.equal(run.response.code, 422);
      assert.deepEqual(run.response.body.configErrors.map((e) => e.fieldPath), ["mappings.schema", "mappings.versions"]);
      assert.equal(run.httpCalls.length, 1);
      assert.equal(endpoint.externalEffects(), 0);
    });
  }

  test("the simulators refuse node and module types they do not model", () => {
    const n8n = clone(set.n8n);
    n8n.nodes.find((n) => n.name === "Kit Settings").type = "n8n-nodes-base.executeCommand";
    const a = simulateN8n(n8n, { body: periodNRequest(), endpoint: createChangedPeriodEndpoint({ clock: SCENARIO_CLOCK }) });
    assert.equal(a.status, "error");
    assert.match(a.error.message, /not supported/);
    const make = clone(set.make);
    make.flow[2].module = "google-sheets:addRow";
    const b = simulateMake(make, { body: periodNRequest(), endpoint: createChangedPeriodEndpoint({ clock: SCENARIO_CLOCK }) });
    assert.equal(b.status, "error");
    assert.match(b.error.message, /not supported/);
  });

  test("evaluate outcomes match across Make, n8n and direct on every step except the rerun after the partial attempt", () => {
    const runs = Object.fromEntries(ROUTES.map((r) => [r, runScenario(r)]));
    runs.direct.steps.forEach((s, i) => {
      if (s.step === "period-N+1 rerun") return;
      assert.deepEqual(runs.make.steps[i].outcomes, s.outcomes, `make ${s.step}`);
      assert.deepEqual(runs.n8n.steps[i].outcomes, s.outcomes, `n8n ${s.step}`);
      assert.equal(runs.make.steps[i].responseCode, s.responseCode);
      assert.equal(runs.n8n.steps[i].responseCode, s.responseCode);
    });
  });

  test("the simulation is deterministic", () => {
    assert.deepEqual(runScenario("n8n"), runScenario("n8n"));
    assert.deepEqual(runScenario("make"), runScenario("make"));
  });
});
