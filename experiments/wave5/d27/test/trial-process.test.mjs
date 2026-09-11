import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { BUYER_CLASS, KIND, TESTED_WRAPPER_SHA, contractRecord } from "../lib/contract.mjs";
import { PYTHON_TRIAL, REPO_ROOT, RUNTIME_AFTER, RUNTIME_BEFORE } from "../lib/paths.mjs";
import { runTrial } from "../lib/trial.mjs";
import { stageRuntimeOwned, writeTemp } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "../bin/d27-trial.mjs");

function spawnTrial(argv, timeoutMs = 120_000) {
  return spawnSync(process.execPath, [bin, ...argv], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseCli(r) {
  assert.equal(r.signal, null, r.stderr || r.stdout);
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: { "content-type": "application/json" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function startListenProcess() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, "listen", "--host", "127.0.0.1", "--port", "0"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`listen timeout stdout=${stdout} stderr=${stderr}`));
    }, 20_000);
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
      const line = stdout.trim().split("\n")[0];
      try {
        const info = JSON.parse(line);
        if (info.url) {
          clearTimeout(timer);
          resolve({ child, info });
        }
      } catch {
        /* wait */
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("W5-D27 independent-runtime trial kit", { timeout: 180_000 }, () => {
  it("contract names the PR52 pin and does not claim D01/Co14", () => {
    const r = spawnTrial(["contract"]);
    assert.equal(r.status, 0, r.stderr);
    const body = parseCli(r);
    assert.equal(body.testedImplementation.sha, TESTED_WRAPPER_SHA);
    assert.equal(body.testedImplementation.pr, 52);
    assert.equal(body.readOnlyPins.d01Contract.claimed, false);
    assert.equal(body.readOnlyPins.co14PythonClient.consumed, false);
    assert.equal(contractRecord().schema, "samedaydesk.wave5.d27.independent-runtime-trial.v1");
  });

  it("first-execution owner-qa Python run uses runtime-owned input and keeps unlike digests unequal", () => {
    const outDir = mkdtempSync(join(tmpdir(), "d27-first-"));
    const r = spawnTrial(["first-execution", "--buyer-class", "owner-qa", "--out-dir", outDir]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const suite = parseCli(r);
    assert.equal(suite.ok, true);
    assert.equal(suite.sold, false);
    assert.equal(suite.demand.claimed, false);
    assert.equal(suite.demand.buyerClass, BUYER_CLASS.OWNER_QA);
    const kinds = Object.fromEntries(suite.cases.map((c) => [c.id, c]));
    assert.equal(kinds["own-input-change"].kind, KIND.USEFUL_CHANGE);
    assert.equal(kinds["own-input-no-change"].kind, KIND.USEFUL_NO_CHANGE);
    assert.equal(kinds["own-input-unsupported-html"].kind, KIND.USEFUL_REFUSAL);
    assert.notEqual(kinds["own-input-change"].outputsDigest, kinds["own-input-no-change"].outputsDigest);
    assert.match(kinds["own-input-change"].outputsDigest, /^[0-9a-f]{64}$/);
    assert.match(kinds["own-input-no-change"].outputsDigest, /^[0-9a-f]{64}$/);
    const impact = JSON.parse(readFileSync(join(outDir, "own-input-change/budget-impact.json"), "utf8"));
    assert.equal(impact.status, "actionable");
    assert.match(JSON.stringify(impact), /runtime-alpha-input/);
    assert.equal(impact.caller.sampleLabel, "caller-input");
    assert.equal(existsSync(join(outDir, "own-input-no-change/budget-impact.json")), true);
    const refused = JSON.parse(readFileSync(join(outDir, "own-input-unsupported-html/budget-impact.json"), "utf8"));
    assert.equal(refused.status, "refused");
    assert.equal(existsSync(join(outDir, "first-execution.json")), true);
  });

  it("missing --after is wrapper-refusal, not transport-failure", () => {
    const staged = stageRuntimeOwned();
    const r = spawnTrial([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--before",
      staged.before,
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.WRAPPER_REFUSAL);
    assert.equal(body.code, "missing-required-inputs");
    assert.equal(body.engineInvoked, false);
    assert.equal(body.sold, false);
  });

  it("malformed JSON is wrapper-refusal input-malformed", () => {
    const staged = stageRuntimeOwned();
    const bad = writeTemp(staged.work, "bad.json", "{not json\n");
    const r = spawnTrial([
      "run",
      "--buyer-class",
      "owner-qa",
      "--before",
      staged.before,
      "--after",
      bad,
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.WRAPPER_REFUSAL);
    assert.equal(body.code, "input-malformed");
  });

  it("--example is sample-not-sale and not a recruited result", () => {
    const r = spawnTrial(["run", "vendor-budget-impact", "--buyer-class", "owner-qa", "--example"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.SAMPLE_NOT_SALE);
    assert.equal(body.demand.claimed, false);
    assert.equal(body.wrapper.sold, false);
    assert.equal(body.wrapper.sample, true);
  });

  it("recruited-independent without evidence is honesty-refuse and does not spawn the wrapper", () => {
    const r = spawnTrial([
      "run",
      "--buyer-class",
      "recruited-independent",
      "--before",
      RUNTIME_BEFORE,
      "--after",
      RUNTIME_AFTER,
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.HONESTY_REFUSE);
    assert.equal(body.code, "recruitment-not-executed");
    assert.equal(body.wrapper, null);
    assert.equal(body.engineInvoked, false);
  });

  it("invented demandClaim is honesty-refuse", () => {
    const body = runTrial({
      jobId: "vendor-budget-impact",
      inputs: { before: RUNTIME_BEFORE, after: RUNTIME_AFTER },
      buyerClass: BUYER_CLASS.OWNER_QA,
      demandClaim: "organic",
    });
    assert.equal(body.kind, KIND.HONESTY_REFUSE);
    assert.equal(body.code, "invented-demand");
    assert.equal(body.wrapper, null);
  });

  it("unknown job is wrapper-refusal unknown-job", () => {
    const r = spawnTrial(["run", "not-a-real-job", "--buyer-class", "owner-qa"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.WRAPPER_REFUSAL);
    assert.equal(body.code, "unknown-job");
  });

  it("missing python is transport-failure, not a skipped pass", () => {
    const staged = stageRuntimeOwned();
    const r = spawnTrial([
      "run",
      "--buyer-class",
      "owner-qa",
      "--before",
      staged.before,
      "--after",
      staged.after,
      "--python",
      "/no/such/d27-python",
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.TRANSPORT_FAILURE);
    assert.equal(body.code, "missing-python");
  });

  it("missing node is transport-failure from the Python runtime", () => {
    const staged = stageRuntimeOwned();
    const r = spawnTrial([
      "run",
      "--buyer-class",
      "owner-qa",
      "--before",
      staged.before,
      "--after",
      staged.after,
      "--node",
      "/no/such/d27-node",
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = parseCli(r);
    assert.equal(body.kind, KIND.TRANSPORT_FAILURE);
    assert.equal(body.code, "missing-node");
  });

  it("loopback HTTP accepts the runtime-owned files and returns useful-change", async () => {
    const { child, info } = await startListenProcess();
    try {
      const health = await new Promise((resolve, reject) => {
        http.get(`${info.url}/health`, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          });
        }).on("error", reject);
      });
      assert.equal(health.status, 200);
      assert.equal(health.body.contract.testedImplementation.sha, TESTED_WRAPPER_SHA);
      const posted = await postJson(`${info.url}/trial`, {
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        inputs: { before: RUNTIME_BEFORE, after: RUNTIME_AFTER },
      });
      assert.equal(posted.status, 200);
      assert.equal(posted.body.kind, KIND.USEFUL_CHANGE);
      assert.equal(posted.body.demand.claimed, false);
      assert.match(posted.body.artifactSummary, /fieldChanges=/);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("Python trial runtime does not vendor the Co14 client", () => {
    const text = readFileSync(PYTHON_TRIAL, "utf8");
    assert.equal(text.includes("samedaydesk_useful_jobs"), false);
    assert.equal(text.includes("tools/python-useful-jobs-client"), false);
    assert.match(text, /subprocess/);
  });
});
