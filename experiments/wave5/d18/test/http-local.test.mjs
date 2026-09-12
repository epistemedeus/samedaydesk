import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readReceipt, runVendorBudget, satisfy, tempDir } from "./helpers.mjs";
import { serveDirectory } from "../lib/local-http.mjs";

describe("loopback HTTP mailbox cannot treat job A as job B", { timeout: 180_000 }, () => {
  it("fetches a completed vendor-budget package over real loopback HTTP; that copy satisfies A and not feed-agenda", async () => {
    const produced = tempDir("w5-d18-http-src-");
    const launched = runVendorBudget(produced);
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    const receipt = readReceipt(produced);

    const served = await serveDirectory(produced);
    try {
      const dest = tempDir("w5-d18-http-dst-");
      mkdirSync(dest, { recursive: true });
      const names = ["receipt.json", "budget-impact.json", "budget-impact.md"];
      for (const name of names) {
        const res = await fetch(`${served.origin}/${name}`);
        assert.equal(res.ok, true, `${name} ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(join(dest, name), buf);
      }
      const asA = await satisfy(dest, "vendor-budget-impact", {
        expectedInputsDigest: receipt.inputsDigest,
        evidenceClass: "local-runtime",
      });
      assert.equal(asA.ok, true, JSON.stringify(asA));
      const asB = await satisfy(dest, "feed-agenda", { evidenceClass: "local-runtime" });
      assert.equal(asB.ok, false);
      assert.equal(asB.code, "foreign-job-artifacts");
    } finally {
      await served.close();
    }
  });
});
