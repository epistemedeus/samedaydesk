import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runPaidOffer } from "../lib/wrapper.mjs";
import { callerBudget } from "./helpers.mjs";

describe("d18 refused publication does not overwrite caller artifacts", { timeout: 180_000 }, () => {
  it("failed second-name copy leaves the preexisting first artifact bytes", async () => {
    const out = mkdtempSync(join(tmpdir(), "puj-pub-rollback-"));
    const firstName = "budget-impact.json";
    const secondName = "budget-impact.md";
    const first = join(out, firstName);
    const previous = "previous caller-owned publication\n";
    writeFileSync(first, previous);
    mkdirSync(join(out, secondName));

    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      fundingIntent: "unfunded",
      outDir: out,
    });

    const after = readFileSync(first);
    assert.equal(result.ok, false, "publication failure must refuse");
    assert.equal(result.sold, false);
    assert.equal(result.purchaseAuthority, false);
    assert.deepEqual(after, Buffer.from(previous), "failed publication partially overwrote an existing caller artifact");
  });
});
