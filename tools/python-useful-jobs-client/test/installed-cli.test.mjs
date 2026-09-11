import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import {
  CLIENT_ROOT,
  JOB_IDS,
  PYTHON,
  installedCli,
  installedEnv,
  mkdtempSync,
  parseJson,
  pipInstallUser,
  processAlive,
} from "./helpers.mjs";

let install;
const leftover = [];

before(() => {
  install = pipInstallUser(CLIENT_ROOT);
  leftover.push(install.home);
  assert.equal(install.pip.status, 0, install.pip.stderr + install.pip.stdout);
  assert.equal(existsSync(install.script), true, install.pip.stdout);
  assert.equal(existsSync(install.pins), true, `pins.json missing from install: ${install.loc.stderr}`);
});

after(() => {
  for (const dir of leftover) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fresh pip install console script runs the real useful-jobs CLI", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-installed-run-"));
  leftover.push(work);
  const r = installedCli(install, ["run", "vendor-budget-impact", "--example"], {
    cwd: work,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseJson(r);
  assert.equal(body.ok, true);
  assert.equal(body.job, "vendor-budget-impact");
  assert.equal(body.sample, true);
  assert.equal(body.label, "SAMPLE");
  assert.equal(body.sold, false);
  assert.equal(body.outcome, "complete");
  assert.equal(body.source, "committed-file");
  assert.equal(existsSync(join(body.outDir, "budget-impact.json")), true);
  assert.equal(existsSync(join(body.outDir, "budget-impact.md")), true);
  const artifact = JSON.parse(readFileSync(join(body.outDir, "budget-impact.json"), "utf8"));
  assert.equal(artifact.caller.exampleMode, true);
  assert.equal(artifact.purchaseAuthority, false);
});

test("catalog without archive or kit refuses instead of a constant job list", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-empty-catalog-"));
  leftover.push(work);
  const r = installedCli(install, ["catalog"], {
    cwd: work,
    env: { SAMEDAYDESK_ROOT: "" },
  });
  assert.notEqual(r.status, 0);
  const body = parseJson(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "missing-archive");
  assert.equal(body.jobs, undefined);
});

test("installed catalog reads the extracted catalog, not pins-only constants", () => {
  const r = installedCli(install, ["catalog"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseJson(r);
  assert.equal(body.ok, true);
  assert.equal(body.extracted, true);
  assert.equal(body.source, "committed-file");
  assert.deepEqual(body.jobs, JOB_IDS);
  assert.deepEqual(body.outputs["vendor-budget-impact"], [
    "budget-impact.json",
    "budget-impact.md",
  ]);
  assert.ok(body.kitRoot);
  assert.equal(existsSync(join(body.kitRoot, "catalog.json")), true);
});

test("tar filter TypeError refuses instead of unfiltered extractall", () => {
  const script = `
import io, json, tarfile, tempfile
from pathlib import Path
from samedaydesk_useful_jobs.acquire import _safe_extract
from samedaydesk_useful_jobs.refuse import ClientRefuse

calls = []

def boom(self, *args, **kwargs):
    calls.append({"kwargs": sorted(kwargs.keys())})
    if "filter" in kwargs:
        raise TypeError("filter is an invalid keyword argument for extractall()")
    raise AssertionError("unfiltered extractall must not be called")

tarfile.TarFile.extractall = boom
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    info = tarfile.TarInfo("hello.txt")
    data = b"hello"
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))
dest = Path(tempfile.mkdtemp(prefix="uj-filter-"))
code = None
try:
    _safe_extract(buf.getvalue(), dest)
except ClientRefuse as err:
    code = err.code
except Exception as err:
    code = type(err).__name__ + ":" + str(err)
print(json.dumps({"code": code, "calls": calls, "outside": Path("/tmp/uj-filter-pwned").exists()}))
`;
  const r = spawnSync(PYTHON, ["-c", script], {
    cwd: install.home,
    env: installedEnv(install, { SAMEDAYDESK_ROOT: "" }),
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.code, "extract-filter-required");
  assert.equal(body.outside, false);
  assert.ok(body.calls.some((c) => c.kwargs.includes("filter")));
  assert.equal(
    body.calls.some((c) => !c.kwargs.includes("filter")),
    false,
  );
});

test("unsafe archive members fail extract without writing outside dest", () => {
  const script = `
import io, json, tarfile, tempfile
from pathlib import Path
from samedaydesk_useful_jobs.acquire import _safe_extract
from samedaydesk_useful_jobs.refuse import ClientRefuse

def pack(members):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, kind, data, link in members:
            info = tarfile.TarInfo(name)
            if kind == "file":
                payload = data.encode()
                info.size = len(payload)
                tar.addfile(info, io.BytesIO(payload))
            elif kind == "symlink":
                info.type = tarfile.SYMTYPE
                info.linkname = link
                tar.addfile(info)
    return buf.getvalue()

out = {}
outside = Path("/tmp/w5d08-python-client-escape.txt")
if outside.exists():
    outside.unlink()
cases = {
    "dotdot": [("../../../tmp/w5d08-python-client-escape.txt", "file", "pwned", None)],
    "abs": [("/tmp/w5d08-python-client-escape.txt", "file", "pwned", None)],
    "symlink": [("link", "symlink", "", "/tmp"), ("link/w5d08-python-client-escape.txt", "file", "pwned", None)],
}
for name, members in cases.items():
    dest = Path(tempfile.mkdtemp(prefix="uj-unsafe-"))
    try:
        _safe_extract(pack(members), dest)
        out[name] = {"ok": True, "code": None}
    except ClientRefuse as err:
        out[name] = {"ok": False, "code": err.code}
    except Exception as err:
        out[name] = {"ok": False, "code": type(err).__name__}
out["outside"] = outside.exists()
print(json.dumps(out))
`;
  const r = spawnSync(PYTHON, ["-c", script], {
    cwd: install.home,
    env: installedEnv(install, { SAMEDAYDESK_ROOT: "" }),
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.dotdot.code, "extract-unsafe-path");
  assert.equal(body.abs.code, "extract-unsafe-path");
  assert.equal(body.symlink.code, "extract-unsafe-member");
  assert.equal(body.outside, false);
});

test("real CLI success with deleted outputs is missing-output, not complete, and leaves no orphan", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-missing-out-"));
  leftover.push(work);
  const wrapper = join(work, "delete-outputs-node");
  writeFileSync(
    wrapper,
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const real = process.env.REAL_NODE;
fs.writeFileSync(process.env.WRAPPER_PID_FILE, String(process.pid));
const r = spawnSync(real, process.argv.slice(2), { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (process.argv.includes("run") && r.status === 0) {
  try {
    const body = JSON.parse(String(r.stdout).trim());
    if (body.outDir && fs.existsSync(body.outDir)) {
      for (const name of fs.readdirSync(body.outDir)) {
        fs.unlinkSync(path.join(body.outDir, name));
      }
    }
  } catch {}
}
process.exit(r.status == null ? 1 : r.status);
`,
  );
  chmodSync(wrapper, 0o755);
  const pidFile = join(work, "wrapper.pid");
  const r = installedCli(
    install,
    ["run", "vendor-budget-impact", "--example", "--out-dir", join(work, "out")],
    {
      cwd: work,
      env: {
        USEFUL_JOBS_NODE: wrapper,
        REAL_NODE: process.execPath,
        WRAPPER_PID_FILE: pidFile,
      },
    },
  );
  assert.notEqual(r.status, 0, r.stdout);
  const body = parseJson(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "missing-output");
  assert.equal(body.payment, false);
  assert.equal(body.sold, false);
  assert.deepEqual(body.missing, ["budget-impact.json", "budget-impact.md"]);
  assert.equal(body.outcome, "missing-output");
  const pid = existsSync(pidFile) ? readFileSync(pidFile, "utf8").trim() : "";
  assert.equal(processAlive(pid), false);
});

test("hanging node times out, is killed, and does not remain as an orphan", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-hang-"));
  leftover.push(work);
  const hang = join(work, "hang-node");
  writeFileSync(
    hang,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.HANG_PID_FILE, String(process.pid));
setInterval(() => {}, 1000);
`,
  );
  chmodSync(hang, 0o755);
  const pidFile = join(work, "hang.pid");
  const r = installedCli(install, ["run", "vendor-budget-impact", "--example"], {
    cwd: work,
    env: {
      USEFUL_JOBS_NODE: hang,
      HANG_PID_FILE: pidFile,
      USEFUL_JOBS_TIMEOUT_SEC: "1",
    },
    timeout: 20_000,
  });
  assert.notEqual(r.status, 0);
  const body = parseJson(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "engine-timeout");
  assert.equal(body.timedOut, true);
  assert.equal(body.payment, false);
  const pid = existsSync(pidFile) ? readFileSync(pidFile, "utf8").trim() : "";
  assert.ok(pid, "hanging node must have started");
  assert.equal(processAlive(pid), false);
});
