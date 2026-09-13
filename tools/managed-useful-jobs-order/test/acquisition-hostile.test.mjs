import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  linkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { tmpDir } from "./acquisition-helpers.mjs";
import { AcquisitionRefuse } from "../lib/acquisition-errors.mjs";
import { MAX_FILE_BYTES } from "../lib/acquisition-constants.mjs";
import { sha256Bytes } from "../lib/acquisition-identity.mjs";
import {
  PRINCIPAL_A,
  SERVER_LATER,
  admitAndPublish,
  fileService,
  pairFor,
} from "./acquisition-helpers.mjs";

const HOSTILE_NAMES = [
  "../pin-delta.json",
  "..",
  "pin-delta.json/../x",
  "pin-delta.json\\x",
  "pin-delta.json\0x",
  "pin-delta.json%2f",
  "%2e%2e",
  "%252e%252e",
  "pin-delta.json?x",
  "pin-delta.json#a",
  "/tmp/pin-delta.json",
  "C:\\pin-delta.json",
  "//unc/pin-delta.json",
  "./pin-delta.json",
  "pin-delta.json/",
  "not-promised.json",
];

describe("HA1 hostile paths and bounds", { timeout: 60_000 }, () => {
  it("traversal, encoding aliases, NUL, separators and absolute names refuse", async () => {
    const { service, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-hostile-names" });
    for (const name of HOSTILE_NAMES) {
      await assert.rejects(
        () =>
          reader.openVerified(
            {
              principalId: PRINCIPAL_A,
              executionId: first.executionId,
              requestHash: first.requestHash,
              name,
              sha256: first.pair.outputs[0].sha256,
            },
            SERVER_LATER,
          ),
        (err) => err instanceof AcquisitionRefuse && err.code === "invalid-name",
        name,
      );
    }
  });

  it("symlinks, hardlinks and fifos refuse before exposing bytes", async () => {
    const { service, store, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-links" });
    const target = join(store.artifactRoot, first.executionId, "pin-delta.json");
    const backup = `${target}.bak`;
    renameSync(target, backup);

    symlinkSync(backup, target);
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "hostile-path",
    );
    unlinkSync(target);
    renameSync(backup, target);

    const hard = `${target}.hard`;
    linkSync(target, hard);
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "hostile-path",
    );
    unlinkSync(hard);

    const fifoId = "exec-fifo";
    const fifoPub = await admitAndPublish(service, { executionId: fifoId, pair: pairFor("lockfile-pin-delta", "fifo") });
    const fifoPath = join(store.artifactRoot, fifoId, "pin-delta.md");
    unlinkSync(fifoPath);
    const fifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    assert.equal(fifo.status, 0, fifo.stderr);
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: fifoPub.executionId,
            requestHash: fifoPub.requestHash,
            name: "pin-delta.md",
            sha256: fifoPub.pair.outputs[1].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && (err.code === "hostile-path" || err.state === "integrity-failed"),
    );
  });

  it("path-swap after open refuses when the path inode no longer matches the fd", async () => {
    const { service, store, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-swap" });
    const path = join(store.artifactRoot, first.executionId, "pin-delta.json");
    const decoy = `${path}.decoy`;
    writeFileSync(decoy, Buffer.from('{"swapped":true}\n'));
    service.hooks.afterOpenFd = () => {
      unlinkSync(path);
      renameSync(decoy, path);
    };
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "hostile-path",
    );
  });

  it("device nodes refuse when the host can create them", async () => {
    const { service, store, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-dev" });
    const path = join(store.artifactRoot, first.executionId, "pin-delta.json");
    unlinkSync(path);
    const linked = spawnSync("ln", ["/dev/null", path], { encoding: "utf8" });
    if (linked.status !== 0) {
      const mknod = spawnSync("mknod", [path, "c", "1", "3"], { encoding: "utf8" });
      if (mknod.status !== 0) {
        writeFileSync(path, first.pair.files[0].bytes);
        return;
      }
    }
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "hostile-path",
    );
  });

  it("per-file and total bounds refuse oversize publications", async () => {
    const { service } = await fileService();
    const oversize = Buffer.alloc(MAX_FILE_BYTES + 1, 1);
    const pair = pairFor("lockfile-pin-delta", "big");
    pair.outputs[0] = {
      name: "pin-delta.json",
      kind: "file",
      bytes: oversize.length,
      sha256: sha256Bytes(oversize),
    };
    pair.files[0] = { metadata: pair.outputs[0], bytes: oversize };
    await assert.rejects(
      () => admitAndPublish(service, { executionId: "exec-oversize", pair }),
      (err) => err instanceof AcquisitionRefuse && err.code === "oversize",
    );
  });

  it("abort releases the read gate and never executes", async () => {
    const { service, reader } = await fileService({ maxConcurrentReads: 1 });
    const first = await admitAndPublish(service, { executionId: "exec-abort" });
    const ac = new AbortController();
    service.hooks.afterOpenFd = () => {
      ac.abort();
    };
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
          { signal: ac.signal },
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "aborted",
    );
    service.hooks.afterOpenFd = null;
    const opened = await reader.openVerified(
      {
        principalId: PRINCIPAL_A,
        executionId: first.executionId,
        requestHash: first.requestHash,
        name: "pin-delta.json",
        sha256: first.pair.outputs[0].sha256,
      },
      SERVER_LATER,
    );
    assert.equal(opened.metadata.sha256, first.pair.outputs[0].sha256);
    assert.equal(service.maxConcurrentReads.active, 0);
  });

  it("FIFO replace between lstat and open does not block; known-bad blocking open is killed", async () => {
    const { service, store, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-fifo-race" });
    const path = join(store.artifactRoot, first.executionId, "pin-delta.json");
    const backup = `${path}.bak`;
    service.hooks.betweenLstatAndOpen = (openPath) => {
      renameSync(openPath, backup);
      const made = spawnSync("mkfifo", [openPath], { encoding: "utf8" });
      assert.equal(made.status, 0, made.stderr);
    };
    const t0 = Date.now();
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "hostile-path",
    );
    assert.ok(Date.now() - t0 < 1000, "nonblocking FIFO open must return quickly");
    service.hooks.betweenLstatAndOpen = null;
    unlinkSync(path);
    renameSync(backup, path);

    const probeDir = tmpDir("ha1-fifo-block-");
    const probePath = join(probeDir, "probe");
    writeFileSync(probePath, "regular\n");
    const script = join(probeDir, "block-open.mjs");
    writeFileSync(
      script,
      `import { constants, lstatSync, openSync, readSync } from "node:fs";
const path = process.argv[2];
lstatSync(path);
process.stdout.write("STATTED\\n");
readSync(0, Buffer.alloc(1), 0, 1, null);
openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
process.stdout.write("OPENED\\n");
`,
    );
    const child = spawn(process.execPath, [script, probePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    const hardKill = setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
    }, 1500);
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("child never statt'ed")), 500);
        const check = () => {
          if (out.includes("STATTED")) {
            clearTimeout(t);
            resolve();
          }
        };
        child.stdout.on("data", check);
        check();
      });
      unlinkSync(probePath);
      const fifo = spawnSync("mkfifo", [probePath], { encoding: "utf8" });
      assert.equal(fifo.status, 0, fifo.stderr);
      child.stdin.write("x");
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(out.includes("OPENED"), false, "known-bad blocking open must still be blocked");
      assert.equal(child.exitCode, null);
      child.kill("SIGKILL");
      await new Promise((resolve) => child.once("close", resolve));
      assert.equal(out.includes("OPENED"), false);
    } finally {
      clearTimeout(hardKill);
      if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
    }
  });

  it("parent symlink boundaries refuse", async () => {
    const { service, store, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-parent-link" });
    const realDir = join(store.artifactRoot, first.executionId);
    const moved = `${realDir}.real`;
    renameSync(realDir, moved);
    symlinkSync(moved, realDir);
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "hostile-path",
    );
  });
});
