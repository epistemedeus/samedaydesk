import { describe, it } from "node:test";
import {
  assert,
  existsSync,
  join,
  readJson,
} from "./helpers.mjs";
import { runOwnerQaJourney } from "../lib/journey.mjs";
import { D09_SHA } from "../lib/repo.mjs";

describe("W5-D25 owner-QA buyer journey", { timeout: 180_000 }, () => {
  it("two controlled real jobs complete through public offer, CLI, delivery and return", async () => {
    const result = await runOwnerQaJourney();
    assert.equal(result.qa.label, "owner-qa");
    assert.equal(result.qa.customer, false);
    assert.equal(result.qa.recruited, false);
    assert.equal(result.qa.independentDemand, false);
    assert.equal(result.qa.settlement, false);
    assert.equal(result.offer.advertised, true, JSON.stringify(result.offer));
    assert.equal(result.offer.purchaseAuthority, false);
    assert.equal(result.offer.liveSettlement, "out-of-scope");
    assert.deepEqual(result.offer.outputs, ["budget-impact.json", "budget-impact.md"]);

    assert.equal(result.job1.processStatus, 0, result.job1.classified.kind);
    assert.equal(result.job1.ok, true);
    assert.equal(result.job1.sold, false);
    assert.equal(result.job1.sample, false);
    assert.equal(result.job1.classified.kind, "analysis-change");
    assert.equal(result.job1.classified.complete, true);
    assert.equal(result.job1.fundingState, "reserved-fixture");
    assert.equal(existsSync(join(result.job1.outDir, "budget-impact.json")), true);
    assert.equal(existsSync(join(result.job1.outDir, "receipt.json")), true);

    assert.equal(result.ticket.processStatus, 0, JSON.stringify(result.ticket.classified));
    assert.equal(result.ticket.classified.kind, "analysis-change");
    const ticket = readJson(join(result.ticket.outDir, "repeat-job.json"));
    assert.equal(ticket.appId, "repeat-job-record");
    assert.equal(ticket.repeatJob.schedulerDaemon, false);
    assert.equal(ticket.repeatJob.family, "pricing-row-unit");

    assert.equal(result.freeze.changed.ok, true, JSON.stringify(result.freeze.changed));
    assert.equal(result.freeze.notReuse.ok, true, JSON.stringify(result.freeze.notReuse));
    assert.notEqual(result.freeze.previous.after.sha256, result.freeze.current.after.sha256);

    assert.equal(result.d09.binderSha, D09_SHA);
    assert.equal(result.d09.parseable, true, result.d09.body && JSON.stringify(result.d09.body));
    assert.equal(result.d09.body?.ok, true, JSON.stringify(result.d09.body));
    assert.equal(result.d09.body?.status, "actionable");
    assert.equal(result.d09.body?.distinctFromFirst, true);
    assert.equal(result.d09.body?.schedulerDaemon, false);
    assert.match(String(result.d09.body?.termsVersion || ""), /^sha256:[0-9a-f]{64}$/);
    const d01Receipt = readJson(join(result.job1.outDir, "receipt.json"));
    assert.equal(d01Receipt.termsVersion == null, true);
    assert.notEqual(result.d09.body.termsVersion, d01Receipt.inputsDigest);

    assert.equal(result.job2.processStatus, 0, JSON.stringify(result.job2.classified));
    assert.equal(result.job2.ok, true);
    assert.equal(result.job2.sold, false);
    assert.equal(result.job2.classified.kind, "analysis-change");
    assert.equal(result.job2.classified.complete, true);
    assert.notEqual(result.job1.inputsDigest, result.job2.inputsDigest);
    assert.notEqual(result.job1.outputsDigest, result.job2.outputsDigest);
    assert.equal(result.twoJobsComplete, true);
    assert.equal(result.ok, true);

    const impact1 = readJson(join(result.job1.outDir, "budget-impact.json"));
    const impact2 = readJson(join(result.job2.outDir, "budget-impact.json"));
    assert.equal(impact1.status, "actionable");
    assert.equal(impact2.status, "actionable");
    assert.notEqual(impact1.digest, impact2.digest);
  });
});
