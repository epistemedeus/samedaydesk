import assert from "node:assert/strict";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG, VERIFY_CLI, f08Root, tempDir } from "./helpers.mjs";
import { launchPaidWrapper, loadF08Digest } from "../lib/launch.mjs";
import { verifyComplete } from "../lib/verify.mjs";
import { createDigestAdapter } from "../lib/digest.mjs";
import { F08_TESTED_SHA } from "../lib/pins.mjs";

describe("caller journey: complete then portable verify", { timeout: 180_000 }, () => {
  it("F08 digestNamedBytes at tested SHA matches the injected adapter", async () => {
    const root = f08Root();
    const live = await loadF08Digest(root);
    const fallback = createDigestAdapter();
    const sample = [
      { name: "budget-impact.md", bytes: 3, sha256: "ab".repeat(32) },
      { name: "budget-impact.json", bytes: 2, sha256: "cd".repeat(32) },
    ];
    assert.equal(fallback.digestNamedBytes(sample), live.digestNamedBytes(sample));
  });

  it("successful caller-file run produces complete output; copy to a new root still verifies", () => {
    const wrapperRoot = f08Root();
    const outDir = tempDir("joa-complete-");
    const launched = launchPaidWrapper({ f08Root: wrapperRoot, outDir });
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    assert.equal(launched.testedSha, F08_TESTED_SHA);
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
    assert.equal(existsSync(join(outDir, "budget-impact.md")), true);
    assert.equal(existsSync(join(outDir, "receipt.json")), true);

    const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
    assert.equal(receipt.sold, false);
    assert.equal(receipt.purchaseAuthority, false);
    assert.equal(receipt.jobId, "vendor-budget-impact");

    const first = verifyComplete({
      root: outDir,
      catalogPath: CATALOG,
      evidenceClass: "local-runtime",
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.classification, "complete");
    assert.match(first.termsVersion, /^sha256:[0-9a-f]{64}$/);
    assert.equal(first.purchaseAuthority, false);

    const portable = tempDir("joa-portable-");
    const dest = join(portable, "package");
    cpSync(outDir, dest, { recursive: true });
    rmSync(outDir, { recursive: true, force: true });

    const cli = spawnSync(process.execPath, [VERIFY_CLI, "--root", dest, "--catalog", CATALOG], {
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    const body = JSON.parse(cli.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.classification, "complete");
    assert.equal(body.root, dest);
    assert.ok(body.producerNotes.some((n) => n.code === "absolute-path-not-portable"));
    assert.equal(body.termsVersion, first.termsVersion);
  });
});
