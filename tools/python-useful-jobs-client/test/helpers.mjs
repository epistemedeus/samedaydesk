import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CLIENT_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(here, "../../..");
function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const which = spawnSync("which", ["python3"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return "python3";
}

export const PYTHON = resolvePython();
export const ARCHIVE = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz",
);
export const KIT_JSON = join(REPO_ROOT, "client/src/data/usefulJobsKit.json");
export const CATALOG = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
export const ARCHIVE_PUBLIC_PATH = "/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";

export const JOB_IDS = [
  "api-upgrade-brief",
  "vendor-budget-impact",
  "feed-agenda",
  "evidence-ci-annotation",
  "listing-repair-packet",
  "repeat-job-record",
];

export function kitPin() {
  return JSON.parse(readFileSync(KIT_JSON, "utf8"));
}

export function pythonEnv(extra = {}) {
  return {
    ...process.env,
    PYTHONPATH: CLIENT_ROOT,
    SAMEDAYDESK_ROOT: REPO_ROOT,
    PYTHONUNBUFFERED: "1",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    NO_PROXY: "*",
    ...extra,
  };
}

export function py(args, opts = {}) {
  return spawnSync(PYTHON, ["-m", "samedaydesk_useful_jobs", ...args], {
    cwd: opts.cwd || REPO_ROOT,
    env: pythonEnv(opts.env),
    encoding: "utf8",
    timeout: opts.timeout || 60_000,
  });
}

export function pyAsync(args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(PYTHON, ["-m", "samedaydesk_useful_jobs", ...args], {
      cwd: opts.cwd || REPO_ROOT,
      env: pythonEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolveP({ status, stdout, stderr }));
  });
}

export function parseJson(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

export function importClient(script) {
  return spawnSync(PYTHON, ["-c", script], {
    cwd: REPO_ROOT,
    env: pythonEnv(),
    encoding: "utf8",
    timeout: 30_000,
  });
}

export function serveBytes(body, { path = ARCHIVE_PUBLIC_PATH, status = 200 } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url !== path) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(status, {
      "content-type": "application/gzip",
      "content-length": String(status === 200 ? body.length : 0),
    });
    if (status === 200) res.end(body);
    else res.end();
  });
  return new Promise((resolveP) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveP({
        origin: `http://127.0.0.1:${port}`,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

export function assertNoPaymentStory(body) {
  const error = String(body.error || "");
  assert.equal(body.payment, false);
  assert.equal(body.sold, false);
  assert.doesNotMatch(error, /402|payment failed|settled sale|live sale succeeded/i);
}

export { existsSync, join, readFileSync };
