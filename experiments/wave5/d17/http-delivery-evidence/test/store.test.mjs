import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RESOURCES,
  SETTLEMENT_CLASS,
  DELIVERY,
  openStore,
  recordFromObservedResponse,
  joinKey,
} from "../src/index.mjs";
import { historicalV1Row, validExtractBody } from "./helpers.mjs";

test("optional validation records survive restart and still join unchanged v1 rows", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "d17-http-store-"));
  try {
    const body = validExtractBody();
    const bytes = Buffer.from(JSON.stringify(body));
    const record = recordFromObservedResponse({
      method: "GET",
      resource: RESOURCES.EXTRACT,
      responseBytes: bytes,
      merchantHttpStatus: 200,
      settlementClass: SETTLEMENT_CLASS.SIMULATED,
      settlementReference: `0x${"e".repeat(64)}`,
    });
    const v1 = historicalV1Row({
      responseDigest: record.responseDigest,
      method: "GET",
      route: "/extract",
    });
    await writeFile(
      path.join(dir, "commerce-paid-success-evidence.ndjson"),
      `${JSON.stringify(v1)}\n`,
      "utf8",
    );

    const first = openStore(dir);
    await first.appendValidation(record);
    const joinedOnce = await first.join({ currentValidatorVerdict: "validated" });
    assert.equal(joinedOnce.length, 1);
    assert.equal(joinedOnce[0].historical.validatorVerdict, "not_checked");
    assert.equal(joinedOnce[0].validations[0].deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
    assert.equal(
      joinKey(joinedOnce[0].historical),
      joinKey({
        method: record.method,
        resource: record.resource,
        responseDigest: record.responseDigest,
      }),
    );

    const second = openStore(dir);
    const joinedAgain = await second.join({ currentValidatorVerdict: "validated" });
    assert.equal(joinedAgain.length, 1);
    assert.equal(joinedAgain[0].historical.id, v1.id);
    assert.equal(joinedAgain[0].validations.length, 1);
    assert.equal(joinedAgain[0].validations[0].recordId, record.recordId);
    assert.equal(joinedAgain[0].historical.validatorSource, "http_runtime_not_checked");

    const fabricated = recordFromObservedResponse({
      method: "GET",
      resource: RESOURCES.EXTRACT,
      responseBytes: Buffer.from(`${bytes.toString("utf8")} `),
      merchantHttpStatus: 200,
      settlementClass: SETTLEMENT_CLASS.SIMULATED,
    });
    assert.notEqual(fabricated.responseDigest, record.responseDigest);
    await second.appendValidation(fabricated);
    const afterFabricated = await openStore(dir).join();
    const matched = afterFabricated.find((row) => row.historical?.id === v1.id);
    assert.equal(matched.validations.some((item) => item.responseDigest === record.responseDigest), true);
    assert.equal(matched.validations.some((item) => item.responseDigest === fabricated.responseDigest), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
