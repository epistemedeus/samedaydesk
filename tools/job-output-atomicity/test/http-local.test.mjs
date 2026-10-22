import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG, f08Root, tempDir } from "./helpers.mjs";
import { launchPaidWrapper } from "../lib/launch.mjs";
import { serveDirectory } from "../lib/local-http.mjs";
import { verifyComplete } from "../lib/verify.mjs";

describe("local HTTP mailbox fetch", { timeout: 180_000 }, () => {
  it("fetches a completed package over real loopback HTTP and verifies at a new root", async () => {
    const wrapperRoot = f08Root();
    const produced = tempDir("joa-http-src-");
    const launched = launchPaidWrapper({ f08Root: wrapperRoot, outDir: produced });
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);

    const served = await serveDirectory(produced);
    try {
      const dest = tempDir("joa-http-dst-");
      mkdirSync(dest, { recursive: true });
      const names = ["receipt.json", "budget-impact.json", "budget-impact.md"];
      for (const name of names) {
        const res = await fetch(`${served.origin}/${name}`);
        assert.equal(res.ok, true, `${name} ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(join(dest, name), buf);
      }
      const result = verifyComplete({
        root: dest,
        catalogPath: CATALOG,
        evidenceClass: "local-runtime",
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.classification, "complete");
    } finally {
      await served.close();
    }
  });
});
