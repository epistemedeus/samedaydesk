import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG, f08Root, tempDir, waitForFile } from "./helpers.mjs";
import { launchPaidWrapper } from "../lib/launch.mjs";
import { killProcessGroup, waitUntilGone } from "../lib/reap.mjs";
import { verifyComplete } from "../lib/verify.mjs";

describe("interrupted wrapper publication", { timeout: 180_000 }, () => {
  it("owned interrupted child exits without leftover process; verify-complete does not accept partial files", async () => {
    const wrapperRoot = f08Root();
    const outDir = tempDir("joa-interrupt-");
    const notifyPath = join(tempDir("joa-notify-"), "publish.txt");

    const launched = launchPaidWrapper({
      f08Root: wrapperRoot,
      outDir,
      detached: true,
      hold: {
        names: ["receipt.json"],
        beforeWrite: true,
        ms: 30_000,
        notifyPath,
      },
    });

    const notified = await waitForFile(notifyPath, { timeoutMs: 90_000 });
    assert.equal(notified, true, "wrapper never reached receipt publication");
    killProcessGroup(launched.pid);
    const closed = await launched.wait({ killAfterMs: 2_000 });
    const leftover = await waitUntilGone(launched.runId, { timeoutMs: 5_000 });
    assert.deepEqual(leftover, [], `leftover pids: ${leftover.join(",")}`);
    assert.notEqual(closed.status, 0);

    const result = verifyComplete({
      root: outDir,
      catalogPath: CATALOG,
      evidenceClass: "local-runtime",
    });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.notEqual(result.classification, "complete");
    assert.ok(
      result.code === "missing-receipt" || result.code === "truncated-receipt",
      JSON.stringify(result),
    );
  });

  it("partial receipt write during interrupt is not a complete result", async () => {
    const wrapperRoot = f08Root();
    const outDir = tempDir("joa-trunc-");
    const notifyPath = join(tempDir("joa-notify-"), "partial.txt");

    const launched = launchPaidWrapper({
      f08Root: wrapperRoot,
      outDir,
      detached: true,
      hold: {
        names: ["receipt.json"],
        partial: true,
        ms: 30_000,
        notifyPath,
      },
    });

    const notified = await waitForFile(notifyPath, { timeoutMs: 90_000 });
    assert.equal(notified, true, "wrapper never reached partial receipt write");
    killProcessGroup(launched.pid);
    await launched.wait({ killAfterMs: 2_000 });
    const leftover = await waitUntilGone(launched.runId, { timeoutMs: 5_000 });
    assert.deepEqual(leftover, []);

    const result = verifyComplete({
      root: outDir,
      catalogPath: CATALOG,
      evidenceClass: "local-runtime",
    });
    assert.equal(result.ok, false);
    if (existsSync(join(outDir, "receipt.json"))) {
      assert.equal(result.code, "truncated-receipt", JSON.stringify(result));
    } else {
      assert.equal(result.code, "missing-receipt", JSON.stringify(result));
    }
  });
});
