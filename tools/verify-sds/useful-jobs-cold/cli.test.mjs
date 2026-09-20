import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { USEFUL_JOBS_PIN, WRONG_SHA, WRONG_BYTES } from "./lib/pin.mjs";
import { remapRefuse, parseJsonOutput, resolveSource } from "./lib/acquire.mjs";
import { isInsideRepo, defaultRoot } from "./lib/repo.mjs";
import { parseArgs } from "./cli.mjs";
import { SEEDED } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function runCli(args) {
  const ran = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: root,
    env: process.env,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: ran.status,
    stdout: ran.stdout || "",
    stderr: ran.stderr || "",
    json: parseJsonOutput(ran.stdout),
  };
}

test("pin constants match published 1.4.7", () => {
  assert.equal(USEFUL_JOBS_PIN.version, "1.4.7");
  assert.equal(
    USEFUL_JOBS_PIN.sha256,
    "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  );
  assert.equal(USEFUL_JOBS_PIN.bytes, 5255824);
  assert.equal(WRONG_SHA.length, 64);
  assert.equal(WRONG_BYTES, 5255823);
});

test("isInsideRepo detects checkout membership", () => {
  const r = defaultRoot();
  assert.equal(isInsideRepo(join(r, "package.json"), r), true);
  assert.equal(isInsideRepo("/tmp/outside-dest.tar.gz", r), false);
});

test("isInsideRepo follows dest parent symlink into checkout", () => {
  const r = defaultRoot();
  const kit = join(r, "client/public/kit");
  const link = join(tmpdir(), `sds-uj-inside-link-${process.pid}`);
  try {
    symlinkSync(kit, link);
    assert.equal(isInsideRepo(join(link, "x.tar.gz"), r), true);
  } finally {
    try {
      unlinkSync(link);
    } catch {
      /* ignore */
    }
  }
});

test("parseJsonOutput reads pretty object despite trailing text", () => {
  const pretty = 'note\n{\n  "ok": false,\n  "code": "wrong-digest"\n}\ntrailing';
  assert.equal(parseJsonOutput(pretty)?.code, "wrong-digest");
});

test("remapRefuse remaps product ok:false + child exit 0", () => {
  const mapped = remapRefuse(
    {
      status: 0,
      stdout: JSON.stringify({
        ok: false,
        refused: true,
        code: "wrong-digest",
        message: "sha mismatch",
        extracted: false,
        destExists: false,
      }),
    },
    { expectedCode: "wrong-digest", seeded: true },
  );
  assert.equal(mapped.refused, true);
  assert.equal(mapped.remapped, true);
  assert.equal(mapped.productCode, "wrong-digest");
  assert.equal(mapped.matches, true);
});

test("value flags do not swallow --json", () => {
  const parsed = parseArgs(["acquire", "--source", "--json"]);
  assert.equal(parsed.missing, "--source");
  assert.equal(parsed.json, true);
  assert.equal(parsed.flags.source, undefined);
  const dest = parseArgs(["acquire", "--dest", "--json"]);
  assert.equal(dest.missing, "--dest");
  const seed = parseArgs(["--seeded-failure", "--json"]);
  assert.equal(seed.missing, "--seeded-failure");
  assert.equal(seed.seededId, null);
});

test("cold acquire exit 0 JSON with sha+bytes+version", () => {
  const ran = runCli(["acquire", "--json", "--source", "kit"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.version, "1.4.7");
  assert.equal(ran.json?.result?.sha256, USEFUL_JOBS_PIN.sha256);
  assert.equal(ran.json?.result?.bytes, USEFUL_JOBS_PIN.bytes);
  assert.equal(ran.json?.result?.outsideRepo, true);
  assert.equal(ran.json?.result?.verifiedOnDisk, true);
  assert.equal(ran.json?.boundary?.paymentSent, false);
  assert.equal(ran.json?.boundary?.catalogWritten, false);
  assert.equal(ran.json?.boundary?.publicWritten, false);
  assert.equal(ran.json?.boundary?.stripeOrX402, false);
  assert.equal(ran.json?.boundary?.liveFetch, false);
  const destPath = ran.json?.result?.dest;
  assert.equal(existsSync(destPath), true);
  const disk = readFileSync(destPath);
  assert.equal(disk.length, USEFUL_JOBS_PIN.bytes);
  assert.equal(createHash("sha256").update(disk).digest("hex"), USEFUL_JOBS_PIN.sha256);
});

test("seeded wrong-sha exit ≠0 SEED_REJECT wrong-digest", () => {
  const ran = runCli(["--seeded-failure", "wrong-sha", "--json"]);
  assert.notEqual(ran.status, 0);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "SEED_REJECT");
  assert.equal(ran.json?.result?.productCode, "wrong-digest");
  assert.equal(ran.json?.result?.remappedFromChildExit0, true);
  assert.equal(ran.json?.result?.childExit, 0);
});

test("seeded wrong-bytes exit ≠0 SEED_REJECT wrong-size", () => {
  const ran = runCli(["--seeded-failure", "wrong-bytes", "--json"]);
  assert.notEqual(ran.status, 0);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "SEED_REJECT");
  assert.equal(ran.json?.result?.productCode, "wrong-size");
  assert.equal(ran.json?.result?.remappedFromChildExit0, true);
});

test("harness run exit 0 coldOk+seedsOk", () => {
  const ran = runCli(["run", "--json"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.coldOk, true);
  assert.equal(ran.json?.result?.seedsOk, true);
  const steps = ran.json?.result?.steps || [];
  const shaStep = steps.find((s) => s.step === "seeded:wrong-sha");
  const bytesStep = steps.find((s) => s.step === "seeded:wrong-bytes");
  assert.equal(shaStep?.remappedFromChildExit0, true);
  assert.equal(bytesStep?.remappedFromChildExit0, true);
  assert.equal(shaStep?.code, "SEED_REJECT");
  assert.equal(bytesStep?.code, "SEED_REJECT");
});

test("run-harness.mjs exit 0 coldOk+seedsOk", () => {
  const ran = spawnSync(process.execPath, [harness], {
    encoding: "utf8",
    cwd: root,
    env: process.env,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const json = parseJsonOutput(ran.stdout || "");
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(json?.ok, true);
  assert.equal(json?.result?.coldOk, true);
  assert.equal(json?.result?.seedsOk, true);
});

test("dest inside checkout is DEST_INSIDE_REPO", () => {
  const dest = join(root, "tools/verify-sds/useful-jobs-cold/_should-not-write.tar.gz");
  const ran = runCli(["acquire", "--json", "--dest", dest, "--no-extract"]);
  assert.notEqual(ran.status, 0);
  assert.equal(ran.json?.error?.code, "DEST_INSIDE_REPO");
  assert.equal(existsSync(dest), false);
});

test("dest symlink into kit is DEST_INSIDE_REPO and does not write public", () => {
  const kit = join(root, "client/public/kit");
  const before = new Set(readdirSync(kit));
  const link = join(tmpdir(), `sds-uj-cold-link-${process.pid}`);
  try {
    symlinkSync(kit, link);
    const dest = join(link, `_rev-probe-${process.pid}.tar.gz`);
    const ran = runCli(["acquire", "--json", "--dest", dest, "--no-extract"]);
    assert.notEqual(ran.status, 0);
    assert.equal(ran.json?.error?.code, "DEST_INSIDE_REPO");
    assert.equal(existsSync(dest), false);
    const after = new Set(readdirSync(kit));
    for (const name of after) {
      assert.equal(before.has(name), true, `kit gained ${name}`);
    }
  } finally {
    try {
      unlinkSync(link);
    } catch {
      /* ignore */
    }
  }
});

test("seeded wrong-sha does not write dest", () => {
  const dest = join(tmpdir(), `sds-uj-seed-${process.pid}.tar.gz`);
  try {
    const ran = runCli(["--seeded-failure", "wrong-sha", "--json", "--dest", dest]);
    assert.notEqual(ran.status, 0);
    assert.equal(ran.json?.error?.code, "SEED_REJECT");
    assert.equal(ran.json?.result?.destExists, false);
    assert.equal(ran.json?.result?.destOnDisk, false);
    assert.equal(existsSync(dest), false);
  } finally {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
});

test("unknown seeded failure is USAGE exit 2", () => {
  const ran = runCli(["--seeded-failure", "not-a-seed", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "USAGE");
});

test("sha-mismatch alias remaps wrong-digest", () => {
  const ran = runCli(["--seeded-failure", "sha-mismatch", "--json"]);
  assert.notEqual(ran.status, 0);
  assert.equal(ran.json?.error?.code, "SEED_REJECT");
  assert.equal(ran.json?.result?.productCode, "wrong-digest");
  assert.equal(ran.json?.result?.seed, "wrong-sha");
  assert.equal(ran.json?.result?.remappedFromChildExit0, true);
});

test("missing --dest value is USAGE", () => {
  const ran = runCli(["acquire", "--dest"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.error?.code, "USAGE");
});

test("for-agents twin acquire matches pin", () => {
  const ran = runCli(["acquire", "--json", "--source", "for-agents", "--no-extract"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.sha256, USEFUL_JOBS_PIN.sha256);
  assert.equal(ran.json?.result?.bytes, USEFUL_JOBS_PIN.bytes);
  assert.equal(ran.json?.result?.verifiedOnDisk, true);
});

test("--live=true is LIVE_REFUSE fail-closed (not acquire)", () => {
  const ran = runCli(["acquire", "--live=true", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "LIVE_REFUSE");
  assert.equal(ran.json?.result?.liveFetch, false);
  assert.equal(ran.json?.boundary?.liveFetch, false);
});

test("--live flag is LIVE_REFUSE", () => {
  const ran = runCli(["--live", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.error?.code, "LIVE_REFUSE");
});

test("--seeded-failure live is LIVE_REFUSE", () => {
  const ran = runCli(["--seeded-failure", "live", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.error?.code, "LIVE_REFUSE");
});

test("--stripe / --checkout / --x402 / --payment refuse", () => {
  for (const flag of ["--stripe", "--checkout", "--x402", "--payment", "--neo", "--publish"]) {
    const ran = runCli(["acquire", flag, "--json"]);
    assert.equal(ran.status, 2, flag);
    assert.equal(ran.json?.error?.code, "PAYMENT_REFUSE", flag);
    assert.equal(ran.json?.result?.paymentSent, false, flag);
  }
});

test("--buy-now and --pay=now are PAYMENT_REFUSE (prefix, not exact name)", () => {
  for (const flag of ["--buy-now", "--pay=now", "--paypal"]) {
    const ran = runCli(["acquire", flag, "--json"]);
    assert.equal(ran.status, 2, flag);
    assert.equal(ran.json?.error?.code, "PAYMENT_REFUSE", flag);
    assert.equal(ran.json?.result?.paymentSent, false, flag);
  }
});

test("--cdp is LIVE_REFUSE", () => {
  const ran = runCli(["acquire", "--cdp", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.error?.code, "LIVE_REFUSE");
  assert.equal(ran.json?.result?.liveFetch, false);
});

test("unknown --source kits is USAGE (does not silent-default to kit)", () => {
  const dest = join(tmpdir(), `sds-uj-badsrc-${process.pid}.tar.gz`);
  try {
    const ran = runCli(["acquire", "--json", "--source", "kits", "--dest", dest, "--no-extract"]);
    assert.equal(ran.status, 2, ran.stderr || ran.stdout);
    assert.equal(ran.json?.ok, false);
    assert.equal(ran.json?.error?.code, "USAGE");
    assert.match(ran.json?.error?.message || "", /unknown --source/);
    assert.equal(existsSync(dest), false);
  } finally {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
});

test("resolveSource allowlist", () => {
  assert.equal(resolveSource(undefined).source, "kit");
  assert.equal(resolveSource("kit").source, "kit");
  assert.equal(resolveSource("KIT").source, "kit");
  assert.equal(resolveSource("for-agents").source, "for-agents");
  assert.equal(resolveSource("FOR-AGENTS").source, "for-agents");
  assert.equal(resolveSource("public").source, "for-agents");
  assert.equal(resolveSource("kits").invalid, true);
  assert.equal(resolveSource("http://example.com").invalid, true);
});

test("user --dest does not extract into dirname(dest)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sds-uj-userdest-"));
  const dest = join(dir, "archive.tar.gz");
  try {
    const ran = runCli(["acquire", "--json", "--dest", dest]);
    assert.equal(ran.status, 0, ran.stderr || ran.stdout);
    assert.equal(ran.json?.ok, true);
    assert.equal(ran.json?.result?.dest, dest);
    assert.equal(ran.json?.result?.extractDir == null, true);
    assert.equal(existsSync(dest), true);
    const names = readdirSync(dir);
    assert.deepEqual(names, ["archive.tar.gz"]);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test("cite lists live and payment seeds", () => {
  const ran = runCli(["cite", "--json"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  const seeded = ran.json?.result?.seeded || [];
  assert.equal(seeded.includes("live"), true);
  assert.equal(seeded.includes("payment"), true);
  assert.equal(SEEDED.live.expectCode, "LIVE_REFUSE");
  assert.equal(SEEDED.payment.expectCode, "PAYMENT_REFUSE");
});

test("--seeded-failure payment is PAYMENT_REFUSE", () => {
  const ran = runCli(["--seeded-failure", "payment", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.error?.code, "PAYMENT_REFUSE");
});

test("missing --seeded-failure value is USAGE not swallowed --json", () => {
  const ran = runCli(["--seeded-failure", "--json"]);
  assert.equal(ran.status, 2);
  assert.equal(ran.json?.error?.code, "USAGE");
  assert.match(ran.json?.error?.message || "", /missing value for --seeded-failure/);
});
