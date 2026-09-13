import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USEFUL_JOBS_ARCHIVE,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_COLD_START,
  USEFUL_JOBS_JOB_IDS,
  USEFUL_JOBS_ROOT,
} from "../../../../client/src/data/machineEntry.mjs";
import { APPROVED_147 } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const clientDir = join(root, "client");
const distDir = join(clientDir, "dist");
const PREVIEW_PORT = 4187;
const PREVIEW_ORIGIN = `http://127.0.0.1:${PREVIEW_PORT}`;

function get(url) {
  return new Promise((resolveP, reject) => {
    const req = http.get(url, { timeout: 30_000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolveP({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`timeout ${url}`));
    });
  });
}

function waitForOrigin(origin, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  return new Promise((resolveP, reject) => {
    const tick = () => {
      const req = http.get(`${origin}/discovery/useful-jobs.json`, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolveP();
        retry();
      });
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`preview did not become ready at ${origin}`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || root,
      env: { ...process.env, ...(opts.env || {}) },
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

test("served dist: documented acquire, list, and nonpayment", { timeout: 240_000 }, async () => {
  const build = spawnSync("npm", ["run", "build"], {
    cwd: clientDir,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768",
    },
    timeout: 180_000,
  });
  assert.equal(build.status, 0, build.stderr + build.stdout);
  assert.equal(existsSync(join(distDir, "for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz")), true);
  assert.equal(existsSync(join(distDir, "discovery/useful-jobs.json")), true);

  const viteBin = join(clientDir, "node_modules/vite/bin/vite.js");
  const preview = spawn(
    process.execPath,
    [viteBin, "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT), "--strictPort"],
    {
      cwd: clientDir,
      env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let previewOut = "";
  preview.stdout.on("data", (c) => {
    previewOut += c.toString("utf8");
  });
  preview.stderr.on("data", (c) => {
    previewOut += c.toString("utf8");
  });
  const work = mkdtempSync(join(tmpdir(), "h25-served-"));
  try {
    await waitForOrigin(PREVIEW_ORIGIN);

    const discoveryRes = await get(`${PREVIEW_ORIGIN}/discovery/useful-jobs.json`);
    assert.equal(discoveryRes.status, 200);
    const discovery = JSON.parse(discoveryRes.body.toString("utf8"));
    assert.equal(discovery.version, "1.4.7");
    assert.equal(discovery.bytes, APPROVED_147.bytes);
    assert.equal(discovery.sha256, APPROVED_147.sha256);
    assert.equal(discovery.purchaseAuthority, false);
    assert.equal(discovery.paidHostedClaim, false);
    assert.equal(discovery.coldStart, USEFUL_JOBS_COLD_START);
    assert.match(discovery.coldStart, /\/for-agents\/useful-jobs\/useful-jobs-1\.4\.7\.tar\.gz/);

    const archiveRes = await get(`${PREVIEW_ORIGIN}${USEFUL_JOBS_ARCHIVE}`);
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.body.length, USEFUL_JOBS_ARCHIVE_BYTES);
    assert.equal(
      (await import("node:crypto")).createHash("sha256").update(archiveRes.body).digest("hex"),
      USEFUL_JOBS_ARCHIVE_SHA256,
    );

    const kitRes = await get(`${PREVIEW_ORIGIN}/kit/useful-jobs-1.4.7.tar.gz`);
    assert.equal(kitRes.status, 200);
    assert.equal(kitRes.body.length, APPROVED_147.bytes);

    const pageRes = await get(`${PREVIEW_ORIGIN}/for-agents/useful-jobs`);
    assert.equal(pageRes.status, 200, "useful-jobs page must be served from dist");
    const shellRes = await get(`${PREVIEW_ORIGIN}/route-shells/for-agents__useful-jobs.html`);
    assert.equal(shellRes.status, 200, "built route shell must be served from dist");
    const html = shellRes.body.toString("utf8");
    assert.match(html, /Free local package/i);
    assert.match(html, /not hosted execution|does not start hosted extract/i);
    assert.doesNotMatch(html, /start hosted extract on \/for-agents and pay/i);
    assert.doesNotMatch(html, /purchaseAuthority":\s*true/);
    assert.match(html, /e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec/);
    assert.match(html, /useful-jobs-1\.4\.7\.tar\.gz/);
    assert.match(html, /H21 newly reviewed five of the ten/);
    const pageHtml = pageRes.body.toString("utf8");
    assert.doesNotMatch(pageHtml, /purchaseAuthority":\s*true/);

    const acquire = await spawnAsync("bash", ["-c", `${USEFUL_JOBS_COLD_START}\n`], {
      cwd: work,
      env: {
        USEFUL_JOBS_ORIGIN: PREVIEW_ORIGIN,
        TMPDIR: work,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        ALL_PROXY: "",
        NO_PROXY: "*",
      },
    });
    assert.equal(acquire.status, 0, acquire.stderr + acquire.stdout);
    const lines = acquire.stdout.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `stdout must be sole kit path, got ${JSON.stringify(acquire.stdout)}`);
    const kitPath = lines[0];
    assert.equal(kitPath.includes(USEFUL_JOBS_ROOT), true, kitPath);
    assert.equal(existsSync(join(kitPath, "bin/useful-jobs.mjs")), true);
    for (const id of USEFUL_JOBS_JOB_IDS) {
      assert.match(acquire.stderr, new RegExp(id));
    }

    const listed = spawnSync(process.execPath, [join(kitPath, "bin/useful-jobs.mjs"), "list"], {
      cwd: kitPath,
      encoding: "utf8",
    });
    assert.equal(listed.status, 0, listed.stderr + listed.stdout);
    for (const id of USEFUL_JOBS_JOB_IDS) {
      assert.match(listed.stdout, new RegExp(id));
    }
  } finally {
    if (preview.pid && !preview.killed) {
      try {
        process.kill(preview.pid, "SIGTERM");
      } catch {
        /* already exited */
      }
    }
    await new Promise((done) => {
      const t = setTimeout(() => {
        if (preview.pid) {
          try {
            process.kill(preview.pid, "SIGKILL");
          } catch {
            /* already exited */
          }
        }
        done();
      }, 2000);
      preview.once("close", () => {
        clearTimeout(t);
        done();
      });
    });
    rmSync(work, { recursive: true, force: true });
    void previewOut;
  }
});
