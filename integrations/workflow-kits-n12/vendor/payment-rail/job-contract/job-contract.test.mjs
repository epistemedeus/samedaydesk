import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createEffectProjection,
  createEffectStore,
  encodeArtifact,
  evaluateAcceptance,
  rerunAcceptance,
} from "./acceptance.mjs";
import {
  buildJobContract,
  computeRequestDigest,
} from "./job-contract.mjs";
import {
  syntheticDeliveries,
  syntheticJobContract,
  syntheticJobInput,
  usefulDelivery,
} from "./fixtures/load-synthetic-page-change.mjs";

function corruptedQuote() {
  const input = syntheticJobInput();
  return {
    ...input,
    quote: {
      ...input.quote,
      boundRequestDigest: "sha256:" + "ab".repeat(32),
    },
  };
}

describe("positive", () => {
  test("builds a complete job contract with a quote bound to the exact request digest", () => {
    const input = syntheticJobInput();
    const contract = buildJobContract(input);
    assert.equal(contract.synthetic, true);
    assert.equal(contract.schemaVersion, "job-contract.v1");
    assert.equal(contract.requestDigest, input.quote.boundRequestDigest);
    assert.equal(contract.quote.boundRequestDigest, contract.requestDigest);
    assert.equal(contract.quote.amountAtomic, "5000");
    assert.equal(contract.quote.network, "eip155:8453");
    assert.equal(contract.request.body.tool, "page_change_example");
    assert.equal("body" in contract.requestBinding, false);
    assert.match(contract.requestBinding.bodySha256, /^sha256:[0-9a-f]{64}$/);
    assert.equal(
      contract.requestDigest,
      computeRequestDigest({ request: input.request, target: input.target }),
    );
  });

  test("accepts a useful result with required evidence and emits a recoverable artifact", () => {
    const contract = syntheticJobContract();
    const artifact = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract),
      now: Date.parse("2026-11-12T10:00:00.000Z"),
    });
    assert.equal(artifact.decision, "accept");
    assert.deepEqual(artifact.reasons, []);
    assert.deepEqual(artifact.result, syntheticDeliveries().usefulResult);
    assert.equal(artifact.committed, true);
    assert.equal(artifact.recovered, false);
    assert.equal(artifact.secondEffect, false);
    assert.equal(artifact.schemaVersion, "job-acceptance-artifact.v1");
    assert.equal(artifact.requestDigest, contract.requestDigest);
    assert.equal(artifact.synthetic, true);
    const encoded = encodeArtifact(artifact);
    assert.equal(JSON.parse(encoded).decision, "accept");
  });

  test("reruns the saved artifact on a later pass and still accepts", () => {
    const contract = syntheticJobContract();
    const first = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract),
    });
    const replay = rerunAcceptance({
      contract,
      artifact: first,
    });
    assert.equal(replay.decision, "accept");
    assert.deepEqual(replay.result, first.result);
    assert.equal(replay.recovered, true);
    assert.equal(replay.secondEffect, false);
    assert.equal(replay.requestDigest, first.requestDigest);
  });

  test("an immaterial input change does not flip an accepted result", () => {
    const contract = syntheticJobContract();
    const base = usefulDelivery(contract);
    const first = evaluateAcceptance({
      contract,
      delivery: { ...base, input: { ...base.input, traceId: "synthetic-trace-a" } },
    });
    const second = evaluateAcceptance({
      contract,
      delivery: { ...base, input: { ...base.input, traceId: "synthetic-trace-b" } },
    });
    assert.equal(first.decision, "accept");
    assert.equal(second.decision, first.decision);
    assert.deepEqual(second.result, first.result);
  });
});

describe("failure", () => {
  test("rejects an incomplete request before a contract is built", () => {
    const input = syntheticJobInput();
    delete input.request.body;
    assert.throws(() => buildJobContract(input), /JSON object/);
    assert.throws(
      () => buildJobContract({ ...syntheticJobInput(), request: { method: "POST", body: { tool: "page_change_example" } } }),
      /explicit read_only effect/,
    );
  });

  test("rejects a quote that is not bound to the exact request digest", () => {
    assert.throws(() => buildJobContract(corruptedQuote()), /not bound to the exact request digest/);
  });

  test("rejects missing required evidence", () => {
    const contract = syntheticJobContract();
    const delivery = usefulDelivery(contract);
    delivery.evidence = delivery.evidence.filter((item) => item.name !== "recoveryHint");
    const artifact = evaluateAcceptance({ contract, delivery });
    assert.equal(artifact.decision, "reject");
    assert.match(artifact.reasons.join(" "), /missing required evidence: recoveryHint/);
  });

  test("rejects wrong required evidence", () => {
    const contract = syntheticJobContract();
    const fixtures = syntheticDeliveries();
    const delivery = usefulDelivery(contract);
    delivery.evidence = [
      { name: "recoveryHint", value: fixtures.wrongHint },
      fixtures.evidence[1],
    ];
    const artifact = evaluateAcceptance({ contract, delivery });
    assert.equal(artifact.decision, "reject");
    assert.match(artifact.reasons.join(" "), /wrong required evidence: recoveryHint/);
  });

  test("typed output alone never passes", () => {
    const contract = syntheticJobContract();
    const artifact = evaluateAcceptance({
      contract,
      delivery: {
        requestDigest: contract.requestDigest,
        committed: true,
        typedOutput: syntheticDeliveries().typedOutputAlone,
      },
    });
    assert.equal(artifact.decision, "reject");
    assert.match(artifact.reasons.join(" "), /typed output or charge alone/);
    assert.equal(artifact.result, null);
  });

  test("charge alone never passes", () => {
    const contract = syntheticJobContract();
    const artifact = evaluateAcceptance({
      contract,
      delivery: {
        requestDigest: contract.requestDigest,
        committed: true,
        charge: syntheticDeliveries().chargeAlone,
      },
    });
    assert.equal(artifact.decision, "reject");
    assert.match(artifact.reasons.join(" "), /typed output or charge alone/);
    assert.equal(artifact.result, null);
  });

  test("typed output and charge without useful result and evidence never pass", () => {
    const contract = syntheticJobContract();
    const fixtures = syntheticDeliveries();
    const artifact = evaluateAcceptance({
      contract,
      delivery: {
        requestDigest: contract.requestDigest,
        committed: true,
        typedOutput: fixtures.typedOutputAlone,
        charge: fixtures.chargeAlone,
      },
    });
    assert.equal(artifact.decision, "reject");
    assert.match(artifact.reasons.join(" "), /typed output or charge alone/);
    assert.equal(artifact.result, null);
  });

  test("rejects a result that does not match the expected result", () => {
    const contract = syntheticJobContract();
    const artifact = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract, { result: syntheticDeliveries().wrongResult }),
    });
    assert.equal(artifact.decision, "reject");
    assert.match(artifact.reasons.join(" "), /does not match the expected result/);
    assert.equal(artifact.result, null);
  });
});

describe("recovery", () => {
  test("a lost reply after the first effect returns the original result with no second effect", () => {
    const contract = syntheticJobContract();
    const store = createEffectStore();
    const first = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract),
      effectStore: store,
    });
    assert.equal(first.decision, "accept");
    const lostReply = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract),
      effectStore: store,
    });
    assert.equal(lostReply.decision, "accept");
    assert.deepEqual(lostReply.result, first.result);
    assert.equal(lostReply.recovered, true);
    assert.equal(lostReply.secondEffect, false);
    assert.match(lostReply.reasons.join(" "), /no second effect/);
  });

  test("a later attempted result on the same digest does not replace the original effect", () => {
    const contract = syntheticJobContract();
    const store = createEffectStore();
    const first = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract),
      effectStore: store,
    });
    const retry = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract, { result: syntheticDeliveries().wrongResult }),
      effectStore: store,
    });
    assert.equal(retry.recovered, true);
    assert.equal(retry.secondEffect, false);
    assert.deepEqual(retry.result, first.result);
    assert.equal(retry.decision, "accept");
    assert.notDeepEqual(retry.result, syntheticDeliveries().wrongResult);
  });

  test("an uncommitted first request does not fabricate a result", () => {
    const contract = syntheticJobContract();
    const store = createEffectStore();
    const artifact = evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract, { committed: false }),
      effectStore: store,
    });
    assert.equal(artifact.decision, "reject");
    assert.equal(artifact.result, null);
    assert.equal(artifact.committed, false);
    assert.equal(artifact.recovered, false);
    assert.match(artifact.reasons.join(" "), /uncommitted; no result was fabricated/);
    assert.equal(store.get(contract.requestDigest), null);
  });

  test("the effect projection is keyed to the request digest and does not keep task or terms records", () => {
    const contract = syntheticJobContract();
    const store = createEffectProjection();
    evaluateAcceptance({
      contract,
      delivery: usefulDelivery(contract),
      effectStore: store,
    });
    const projected = store.get(contract.requestDigest);
    assert.equal(store.kind, "projection");
    assert.equal(projected.kind, "projection");
    assert.equal(projected.authoritativeKey, contract.requestDigest);
    assert.equal("task" in projected, false);
    assert.equal("terms" in projected, false);
    assert.equal("acceptance" in projected, false);
  });
});
