import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createExecutor, publishCompleteOutputs, runPaidOffer } from "../lib/wrapper.mjs";
import { callerBudget } from "./helpers.mjs";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writePair(dir, first, second) {
  writeFileSync(join(dir, "first.json"), first);
  writeFileSync(join(dir, "second.json"), second);
}

describe("d18 refused publication does not overwrite caller artifacts", { timeout: 180_000 }, () => {
  it("failed second-name copy leaves the preexisting first artifact bytes", async () => {
    const out = tempDir("puj-pub-rollback-");
    try {
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
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("injected failure after first install restores preexisting dest and removes a new dest", () => {
    const src = tempDir("puj-pub-src-");
    const out = tempDir("puj-pub-dst-");
    try {
      writePair(src, "NEW-FIRST\n", "NEW-SECOND\n");
      const original = "ORIGINAL-FIRST\n";
      writeFileSync(join(out, "first.json"), original);
      const pidBak = join(out, `first.json.${process.pid}.bak`);
      writeFileSync(pidBak, "caller-owned-pid-bak\n");

      let installs = 0;
      assert.throws(
        () =>
          publishCompleteOutputs(src, out, ["first.json", "second.json"], {
            afterInstall() {
              installs += 1;
              if (installs === 1) throw new Error("injected-after-first-install");
            },
          }),
        (err) => err.code === "publication-failed" && /injected-after-first-install/.test(err.message),
      );

      assert.equal(installs, 1);
      assert.equal(readFileSync(join(out, "first.json"), "utf8"), original);
      assert.equal(existsSync(join(out, "second.json")), false);
      assert.equal(readFileSync(pidBak, "utf8"), "caller-owned-pid-bak\n");
      assert.equal(readdirSync(out).some((name) => name.startsWith(".puj-publish-")), false);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("injected failure after first install removes a destination that did not previously exist", () => {
    const src = tempDir("puj-pub-src-");
    const out = tempDir("puj-pub-dst-");
    try {
      writePair(src, "NEW-FIRST\n", "NEW-SECOND\n");
      const pidBak = join(out, `first.json.${process.pid}.bak`);
      writeFileSync(pidBak, "caller-owned-pid-bak\n");

      assert.throws(
        () =>
          publishCompleteOutputs(src, out, ["first.json", "second.json"], {
            afterInstall({ index }) {
              if (index === 0) throw new Error("injected-after-first-install");
            },
          }),
        (err) => err.code === "publication-failed",
      );

      assert.equal(existsSync(join(out, "first.json")), false);
      assert.equal(existsSync(join(out, "second.json")), false);
      assert.equal(readFileSync(pidBak, "utf8"), "caller-owned-pid-bak\n");
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("failed restore keeps uniquely owned backups and reports rollback-incomplete", () => {
    const src = tempDir("puj-pub-src-");
    const out = tempDir("puj-pub-dst-");
    try {
      writePair(src, "NEW-FIRST\n", "NEW-SECOND\n");
      const original = "ORIGINAL-FIRST\n";
      writeFileSync(join(out, "first.json"), original);
      const pidBak = join(out, `first.json.${process.pid}.bak`);
      writeFileSync(pidBak, "caller-owned-pid-bak\n");

      let recoveryDir = null;
      assert.throws(
        () =>
          publishCompleteOutputs(src, out, ["first.json", "second.json"], {
            afterInstall({ index }) {
              if (index === 0) throw new Error("injected-after-first-install");
            },
            beforeRestore() {
              throw new Error("injected-restore-fail");
            },
          }),
        (err) => {
          assert.equal(err.code, "rollback-incomplete");
          assert.ok(err.detail?.recoveryDir, "recoveryDir required");
          recoveryDir = err.detail.recoveryDir;
          return true;
        },
      );

      assert.ok(existsSync(recoveryDir), "recovery workspace must survive failed restore");
      const backupFiles = readdirSync(join(recoveryDir, "backups"));
      assert.equal(backupFiles.length, 1);
      assert.equal(readFileSync(join(recoveryDir, "backups", backupFiles[0]), "utf8"), original);
      assert.equal(readFileSync(pidBak, "utf8"), "caller-owned-pid-bak\n");
      assert.notEqual(join(out, `first.json.${process.pid}.bak`), join(recoveryDir, "backups", backupFiles[0]));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("createExecutor uses the same rollback after first successful publication", async () => {
    const out = tempDir("puj-pub-exec-");
    try {
      const original = "previous caller-owned publication\n";
      writeFileSync(join(out, "budget-impact.json"), original);
      const pidBak = join(out, `budget-impact.json.${process.pid}.bak`);
      writeFileSync(pidBak, "caller-owned-pid-bak\n");

      const execute = createExecutor({
        publicationHooks: {
          afterInstall({ index }) {
            if (index === 0) throw new Error("injected-after-first-install");
          },
        },
      });
      const result = await execute({
        jobId: "vendor-budget-impact",
        inputs: callerBudget(),
        fundingIntent: "unfunded",
        outDir: out,
      });

      assert.equal(result.ok, false, "publication failure must refuse");
      assert.equal(result.sold, false);
      assert.equal(result.code, "publication-failed");
      assert.equal(readFileSync(join(out, "budget-impact.json"), "utf8"), original);
      assert.equal(existsSync(join(out, "budget-impact.md")), false);
      assert.equal(readFileSync(pidBak, "utf8"), "caller-owned-pid-bak\n");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
