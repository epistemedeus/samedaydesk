import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USEFUL_JOBS_ACQUIRE_TOOLS,
  USEFUL_JOBS_ARCHIVE,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CALLER_USE,
  USEFUL_JOBS_CATALOG,
  USEFUL_JOBS_COLD_START,
  USEFUL_JOBS_DISCOVERY,
  USEFUL_JOBS_EXAMPLES,
  USEFUL_JOBS_INSTALL,
  USEFUL_JOBS_JOB_IDS,
  USEFUL_JOBS_LIST_HELP,
  USEFUL_JOBS_OUTCOMES,
  USEFUL_JOBS_REPEAT_USE,
  USEFUL_JOBS_RUNTIME,
  USEFUL_JOBS_SHELL,
} from "../../../client/src/data/machineEntry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const obtain = join(here, "../bin/obtain-archive.mjs");
const publicArchive = join(root, "client/public", USEFUL_JOBS_ARCHIVE.replace(/^\//, ""));
const discoveryPath = join(root, "client/public", USEFUL_JOBS_DISCOVERY.replace(/^\//, ""));
const catalogPath = join(root, "client/public", USEFUL_JOBS_CATALOG.replace(/^\//, ""));
const outcomesPath = join(root, "client/public", USEFUL_JOBS_OUTCOMES.replace(/^\//, ""));
const pagePath = join(root, "client/src/pages/UsefulJobs.tsx");
const JOBS = [...USEFUL_JOBS_JOB_IDS];

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Async spawn so an in-process HTTP server can keep serving (spawnSync deadlocks). */
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

function parseJsonStdout(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

function serveArchive({ status = 200, body = null, path = USEFUL_JOBS_ARCHIVE } = {}) {
  const payload = body == null ? readFileSync(publicArchive) : body;
  const server = http.createServer((req, res) => {
    if (req.url !== path) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(status, {
      "content-type": "application/gzip",
      "content-length": String(status === 200 ? payload.length : 0),
    });
    if (status === 200) res.end(payload);
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

function extractTo(dir) {
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, "useful-jobs-1.0.0.tar.gz");
  copyFileSync(publicArchive, dest);
  const tar = spawnSync("tar", ["-xzf", dest, "-C", dir], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);
  return join(dir, "useful-jobs-1.0.0");
}

function runCli(kit, args, cwd) {
  return spawnSync(process.execPath, [join(kit, "bin/useful-jobs.mjs"), ...args], {
    encoding: "utf8",
    cwd: cwd || kit,
  });
}

test("committed public archive matches pinned bytes and sha256", () => {
  assert.equal(existsSync(publicArchive), true);
  const buf = readFileSync(publicArchive);
  assert.equal(buf.length, USEFUL_JOBS_ARCHIVE_BYTES);
  assert.equal(sha256(buf), USEFUL_JOBS_ARCHIVE_SHA256);
  const pin = JSON.parse(
    readFileSync(join(root, "client/public/kit/useful-jobs-1.0.0.sha256.json"), "utf8"),
  );
  assert.equal(pin.sha256, USEFUL_JOBS_ARCHIVE_SHA256);
  assert.equal(pin.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
});

test("discovery, catalog, outcomes, and page share one archive pin and commands", () => {
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const outcomes = JSON.parse(readFileSync(outcomesPath, "utf8"));
  const page = readFileSync(pagePath, "utf8");
  const crawler = USEFUL_JOBS_SHELL.crawlerHtml;

  assert.equal(discovery.sha256, USEFUL_JOBS_ARCHIVE_SHA256);
  assert.equal(discovery.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
  assert.equal(discovery.coldStart, USEFUL_JOBS_COLD_START);
  assert.equal(discovery.purchaseAuthority, false);
  assert.equal(discovery.schedulerDaemon, false);
  assert.equal(discovery.install.length, 1);
  assert.equal(discovery.install[0], USEFUL_JOBS_COLD_START);
  assert.deepEqual(discovery.install, [...USEFUL_JOBS_INSTALL]);
  assert.equal(USEFUL_JOBS_INSTALL[0], USEFUL_JOBS_COLD_START);
  assert.equal(discovery.install.join("\n"), USEFUL_JOBS_COLD_START);
  assert.deepEqual(discovery.acquireTools, [...USEFUL_JOBS_ACQUIRE_TOOLS]);
  assert.equal(discovery.runtime, USEFUL_JOBS_RUNTIME);
  assert.match(discovery.summary, /bash, curl, python3, tar, and mktemp/i);
  assert.match(discovery.summary, /Node 22/i);
  assert.match(discovery.note, /Acquire tools/i);
  assert.match(discovery.note, /Node >= 22/i);
  assert.deepEqual(
    catalog.jobs.map((j) => j.id),
    JOBS,
  );
  assert.deepEqual(
    outcomes.jobs.map((j) => j.id),
    JOBS,
  );
  for (const cmd of [
    USEFUL_JOBS_COLD_START,
    USEFUL_JOBS_LIST_HELP,
    USEFUL_JOBS_EXAMPLES,
    USEFUL_JOBS_CALLER_USE,
    USEFUL_JOBS_REPEAT_USE,
  ]) {
    assert.equal(crawler.includes(cmd), true);
    assert.equal(
      page.includes(cmd.split("\n")[0].replaceAll("\\", "\\\\")) || page.includes("USEFUL_JOBS_"),
      true,
    );
  }
  assert.match(page, /USEFUL_JOBS_COLD_START/);
  assert.match(page, /USEFUL_JOBS_EXAMPLES/);
  assert.match(page, /USEFUL_JOBS_CALLER_USE/);
  assert.match(page, /USEFUL_JOBS_ACQUIRE_TOOLS/);
  assert.match(page, /USEFUL_JOBS_RUNTIME/);
  assert.match(page, /Turn changing files into/);
  assert.match(page, /Six offline jobs for API changes, budgets, feeds, and delivery evidence/);
  assert.match(page, /Acquisition tools/);
  assert.match(page, /Free local package only/);
  assert.match(crawler, /Turn changing files into useful next steps/i);
  assert.match(crawler, /bash/);
  assert.match(crawler, /curl/);
  assert.match(crawler, /python3/);
  assert.match(crawler, /Free local package/i);
  assert.ok(!/no purchase authority/i.test(crawler));
  assert.match(crawler, new RegExp(USEFUL_JOBS_ARCHIVE_SHA256));
});

test("obtain refuses bad status/size/digest before extract or execute", async () => {
  const work = mkdtempSync(join(tmpdir(), "uj-refuse-"));
  try {
    const good = readFileSync(publicArchive);

    const badStatus = await serveArchive({ status: 503 });
    try {
      const dest = join(work, "status.tgz");
      const extractDir = join(work, "status-out");
      const r = await spawnAsync(process.execPath, [
        obtain,
        "--from",
        `${badStatus.origin}${USEFUL_JOBS_ARCHIVE}`,
        "--expected-sha256",
        USEFUL_JOBS_ARCHIVE_SHA256,
        "--expected-bytes",
        String(USEFUL_JOBS_ARCHIVE_BYTES),
        "--dest",
        dest,
        "--extract-dir",
        extractDir,
      ]);
      const body = parseJsonStdout(r);
      assert.equal(body.ok, false);
      assert.equal(body.code, "bad-status");
      assert.equal(existsSync(dest), false);
      assert.equal(existsSync(extractDir), false);
    } finally {
      await badStatus.stop();
    }

    const badSize = await serveArchive({ body: Buffer.concat([good, Buffer.from("x")]) });
    try {
      const dest = join(work, "size.tgz");
      const extractDir = join(work, "size-out");
      const r = await spawnAsync(process.execPath, [
        obtain,
        "--from",
        `${badSize.origin}${USEFUL_JOBS_ARCHIVE}`,
        "--expected-sha256",
        USEFUL_JOBS_ARCHIVE_SHA256,
        "--expected-bytes",
        String(USEFUL_JOBS_ARCHIVE_BYTES),
        "--dest",
        dest,
        "--extract-dir",
        extractDir,
      ]);
      const body = parseJsonStdout(r);
      assert.equal(body.ok, false);
      assert.equal(body.code, "wrong-size");
      assert.equal(existsSync(dest), false);
      assert.equal(existsSync(extractDir), false);
    } finally {
      await badSize.stop();
    }

    const badDigest = await serveArchive({ body: Buffer.alloc(USEFUL_JOBS_ARCHIVE_BYTES, 0x5a) });
    try {
      const dest = join(work, "digest.tgz");
      const extractDir = join(work, "digest-out");
      const r = await spawnAsync(process.execPath, [
        obtain,
        "--from",
        `${badDigest.origin}${USEFUL_JOBS_ARCHIVE}`,
        "--expected-sha256",
        USEFUL_JOBS_ARCHIVE_SHA256,
        "--expected-bytes",
        String(USEFUL_JOBS_ARCHIVE_BYTES),
        "--dest",
        dest,
        "--extract-dir",
        extractDir,
      ]);
      const body = parseJsonStdout(r);
      assert.equal(body.ok, false);
      assert.equal(body.code, "wrong-digest");
      assert.equal(existsSync(dest), false);
      assert.equal(existsSync(extractDir), false);
    } finally {
      await badDigest.stop();
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("shell conditional refuse does not extract or execute", async () => {
  const work = mkdtempSync(join(tmpdir(), "uj-cond-"));
  const srv = await serveArchive({ status: 404 });
  try {
    const fnOnly = USEFUL_JOBS_COLD_START.replace(
      /\nkit=\$\(useful_jobs_acquire\) \|\| exit 1\nprintf '%s\\n' \"\$kit\"\s*$/,
      "\n",
    );
    assert.notEqual(fnOnly, USEFUL_JOBS_COLD_START);
    const script = `${fnOnly}
set +e
if useful_jobs_acquire; then
  echo ACQUIRE_OK > flag.txt
  exit 0
else
  echo ACQUIRE_REFUSED > flag.txt
  exit 7
fi
`;
    const r = await spawnAsync("bash", ["-c", script], {
      cwd: work,
      env: {
        USEFUL_JOBS_ORIGIN: srv.origin,
        TMPDIR: work,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "*",
      },
    });
    assert.equal(r.status, 7, r.stdout + r.stderr);
    assert.equal(readFileSync(join(work, "flag.txt"), "utf8").trim(), "ACQUIRE_REFUSED");
    assert.equal(readdirSync(work).filter((n) => n.startsWith("useful-jobs.")).length, 0);
  } finally {
    await srv.stop();
    rmSync(work, { recursive: true, force: true });
  }
});

test("true concurrent acquisitions use async spawn and both succeed", async () => {
  const work = mkdtempSync(join(tmpdir(), "uj-conc-"));
  const srv = await serveArchive();
  try {
    const mkArgs = (label) => [
      obtain,
      "--from",
      `${srv.origin}${USEFUL_JOBS_ARCHIVE}`,
      "--expected-sha256",
      USEFUL_JOBS_ARCHIVE_SHA256,
      "--expected-bytes",
      String(USEFUL_JOBS_ARCHIVE_BYTES),
      "--dest",
      join(work, `${label}.tar.gz`),
      "--extract-dir",
      join(work, `${label}-out`),
    ];
    const started = Date.now();
    const [a, b] = await Promise.all([
      spawnAsync(process.execPath, mkArgs("a")),
      spawnAsync(process.execPath, mkArgs("b")),
    ]);
    const elapsed = Date.now() - started;
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.equal(JSON.parse(a.stdout).ok, true);
    assert.equal(JSON.parse(b.stdout).ok, true);
    assert.equal(existsSync(join(work, "a-out/useful-jobs-1.0.0/bin/useful-jobs.mjs")), true);
    assert.equal(existsSync(join(work, "b-out/useful-jobs-1.0.0/bin/useful-jobs.mjs")), true);
    assert.ok(elapsed < 20_000, `unexpectedly slow concurrent acquire: ${elapsed}ms`);
  } finally {
    await srv.stop();
    rmSync(work, { recursive: true, force: true });
  }
});

test("unpack outside checkout: list/help, six examples, two callers, missing refuse, changed repeat", () => {
  const outside = mkdtempSync(join(tmpdir(), "uj-outside-"));
  try {
    const kit = extractTo(outside);
    assert.equal(kit.startsWith(root), false);

    const list = runCli(kit, ["list"]);
    assert.equal(list.status, 0, list.stderr);
    for (const id of JOBS) assert.match(list.stdout, new RegExp(id));

    const help = runCli(kit, ["help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /useful-jobs/);

    for (const id of JOBS) {
      const r = runCli(kit, ["run", id, "--example"]);
      assert.equal(r.status, 0, `${id}: ${r.stderr}\n${r.stdout}`);
      assert.match(r.stdout, /"ok"\s*:\s*true/);
    }

    const alpha = runCli(kit, [
      "run",
      "api-upgrade-brief",
      "--before",
      join(kit, "samples/openapi/caller-alpha/before.yaml"),
      "--after",
      join(kit, "samples/openapi/caller-alpha/after.yaml"),
      "--used",
      join(kit, "samples/openapi/caller-alpha/used.json"),
      "--out-dir",
      join(outside, "out-alpha"),
    ]);
    assert.equal(alpha.status, 0, alpha.stderr);
    const beta = runCli(kit, [
      "run",
      "api-upgrade-brief",
      "--before",
      join(kit, "samples/openapi/caller-beta/before.yaml"),
      "--after",
      join(kit, "samples/openapi/caller-beta/after.yaml"),
      "--used",
      join(kit, "samples/openapi/caller-beta/used.json"),
      "--out-dir",
      join(outside, "out-beta"),
    ]);
    assert.equal(beta.status, 0, beta.stderr);
    assert.notEqual(JSON.parse(alpha.stdout).digest, JSON.parse(beta.stdout).digest);

    const missing = runCli(kit, [
      "run",
      "api-upgrade-brief",
      "--before",
      join(kit, "samples/openapi/caller-alpha/before.yaml"),
    ]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stdout + missing.stderr, /missing-required-inputs|required/i);

    const edited = join(outside, "caller-alpha-after-edit.yaml");
    copyFileSync(join(kit, "samples/openapi/caller-alpha/after.yaml"), edited);
    writeFileSync(edited, `${readFileSync(edited, "utf8")}\n# operator edit\n`);
    const beforeHash = sha256(readFileSync(join(kit, "samples/openapi/caller-alpha/before.yaml")));
    const usedHash = sha256(readFileSync(join(kit, "samples/openapi/caller-alpha/used.json")));
    const repeat = runCli(kit, [
      "run",
      "api-upgrade-brief",
      "--before",
      join(kit, "samples/openapi/caller-alpha/before.yaml"),
      "--after",
      edited,
      "--used",
      join(kit, "samples/openapi/caller-alpha/used.json"),
      "--out-dir",
      join(outside, "out-repeat"),
    ]);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.notEqual(JSON.parse(repeat.stdout).digest, JSON.parse(alpha.stdout).digest);
    assert.equal(sha256(readFileSync(join(kit, "samples/openapi/caller-alpha/before.yaml"))), beforeHash);
    assert.equal(sha256(readFileSync(join(kit, "samples/openapi/caller-alpha/used.json"))), usedHash);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("stdout=$(useful_jobs_acquire) returns sole kit path", async () => {
  const work = mkdtempSync(join(tmpdir(), "uj-stdout-"));
  const srv = await serveArchive();
  try {
    const r = await spawnAsync("bash", ["-c", `${USEFUL_JOBS_COLD_START}\n`], {
      cwd: work,
      env: {
        USEFUL_JOBS_ORIGIN: srv.origin,
        TMPDIR: work,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "*",
      },
    });
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `stdout must be sole path, got: ${JSON.stringify(r.stdout)}`);
    assert.equal(existsSync(join(lines[0], "bin/useful-jobs.mjs")), true);
    assert.match(r.stderr, /api-upgrade-brief/);
  } finally {
    await srv.stop();
    rmSync(work, { recursive: true, force: true });
  }
});

/** PATH bin with tar/node spies that log invocations; real tools fall through. */
function makeSpyPath(logDir) {
  const bin = join(logDir, "bin");
  mkdirSync(bin, { recursive: true });
  const tarLog = join(logDir, "tar.log");
  const nodeLog = join(logDir, "node.log");
  writeFileSync(tarLog, "");
  writeFileSync(nodeLog, "");
  const which = spawnSync("bash", ["-lc", "command -v tar; command -v node"], {
    encoding: "utf8",
  });
  const [realTar, realNode] = String(which.stdout || "")
    .trim()
    .split("\n")
    .map((s) => s.trim());
  assert.ok(realTar && realNode, "need real tar and node on host");
  writeFileSync(
    join(bin, "tar"),
    `#!/usr/bin/env bash\nprintf 'tar\\n' >> ${JSON.stringify(tarLog)}\nexec ${JSON.stringify(realTar)} "$@"\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "node"),
    `#!/usr/bin/env bash\nprintf 'node\\n' >> ${JSON.stringify(nodeLog)}\nexec ${JSON.stringify(realNode)} "$@"\n`,
    { mode: 0o755 },
  );
  return { bin, tarLog, nodeLog };
}

/**
 * Execute discovery.install.join('\\n') unchanged under bash if / && wrappers.
 * Origin is injected via USEFUL_JOBS_ORIGIN for the cold-start acquire helper.
 */
async function runPublishedInstall(recipe, { origin, cwd, env = {}, wrap }) {
  const body = recipe.join("\n");
  const scriptPath = join(cwd, "published-install.sh");
  writeFileSync(scriptPath, `${body}\n`, { mode: 0o755 });
  let script;
  if (wrap === "if") {
    script = `if bash ${JSON.stringify(scriptPath)}; then echo OK; else echo FAIL; exit 1; fi`;
  } else if (wrap === "and") {
    script = `bash ${JSON.stringify(scriptPath)} && echo OK`;
  } else {
    script = `bash ${JSON.stringify(scriptPath)}`;
  }
  return spawnAsync("bash", ["-lc", script], {
    cwd,
    env: {
      ...env,
      USEFUL_JOBS_ORIGIN: origin,
      TMPDIR: cwd,
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      NO_PROXY: "*",
      PATH: `${env.PATH || process.env.PATH}`,
    },
  });
}

test("published install recipe: good HTTP extracts and invokes node under if/&&", async () => {
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  const recipe = discovery.install;
  assert.equal(recipe.length, 1);
  assert.equal(recipe.join("\n"), USEFUL_JOBS_COLD_START);

  for (const wrap of ["if", "and"]) {
    const srv = await serveArchive();
    const work = mkdtempSync(join(tmpdir(), `uj-inst-ok-${wrap}-`));
    const spy = makeSpyPath(work);
    try {
      const r = await runPublishedInstall(recipe, {
        origin: srv.origin,
        cwd: work,
        wrap,
        env: { PATH: `${spy.bin}:${process.env.PATH}` },
      });
      assert.equal(r.status, 0, `${wrap}: ${r.stderr}\n${r.stdout}`);
      const kitLine = String(r.stdout)
        .trim()
        .split("\n")
        .find((l) => l.includes("useful-jobs-1.0.0"));
      assert.ok(kitLine, `${wrap} stdout should print kit path; got ${r.stdout}`);
      assert.ok(existsSync(join(kitLine, "bin/useful-jobs.mjs")), kitLine);
      assert.match(readFileSync(spy.tarLog, "utf8"), /tar/);
      assert.match(readFileSync(spy.nodeLog, "utf8"), /node/);
    } finally {
      await srv.stop();
      rmSync(work, { recursive: true, force: true });
    }
  }
});

test("published install recipe: bad HTTP status never runs tar or node", async () => {
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  const recipe = discovery.install;
  for (const wrap of ["if", "and"]) {
    const srv = await serveArchive({ status: 503 });
    const work = mkdtempSync(join(tmpdir(), `uj-inst-503-${wrap}-`));
    const spy = makeSpyPath(work);
    try {
      const r = await runPublishedInstall(recipe, {
        origin: srv.origin,
        cwd: work,
        wrap,
        env: { PATH: `${spy.bin}:${process.env.PATH}` },
      });
      assert.notEqual(r.status, 0, wrap);
      assert.equal(readFileSync(spy.tarLog, "utf8").trim(), "");
      assert.equal(readFileSync(spy.nodeLog, "utf8").trim(), "");
      assert.equal(readdirSync(work).filter((n) => n.startsWith("useful-jobs")).length, 0);
    } finally {
      await srv.stop();
      rmSync(work, { recursive: true, force: true });
    }
  }
});

test("published install recipe: bad size never runs tar or node (python negative control)", async () => {
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  const recipe = discovery.install;
  const short = Buffer.alloc(32, 7);
  for (const wrap of ["if", "and"]) {
    const srv = await serveArchive({ body: short });
    const work = mkdtempSync(join(tmpdir(), `uj-inst-size-${wrap}-`));
    const spy = makeSpyPath(work);
    try {
      const r = await runPublishedInstall(recipe, {
        origin: srv.origin,
        cwd: work,
        wrap,
        env: { PATH: `${spy.bin}:${process.env.PATH}` },
      });
      assert.notEqual(r.status, 0, wrap);
      assert.match(String(r.stderr) + String(r.stdout), /size|sha256|fail|Error|Traceback|!=/i);
      assert.equal(readFileSync(spy.tarLog, "utf8").trim(), "");
      assert.equal(readFileSync(spy.nodeLog, "utf8").trim(), "");
    } finally {
      await srv.stop();
      rmSync(work, { recursive: true, force: true });
    }
  }
});

test("published install recipe: same-length bad digest never runs tar or node", async () => {
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  const recipe = discovery.install;
  const good = readFileSync(publicArchive);
  const bad = Buffer.from(good);
  bad[0] ^= 0xff;
  assert.equal(bad.length, good.length);
  assert.notEqual(sha256(bad), USEFUL_JOBS_ARCHIVE_SHA256);
  for (const wrap of ["if", "and"]) {
    const srv = await serveArchive({ body: bad });
    const work = mkdtempSync(join(tmpdir(), `uj-inst-digest-${wrap}-`));
    const spy = makeSpyPath(work);
    try {
      const r = await runPublishedInstall(recipe, {
        origin: srv.origin,
        cwd: work,
        wrap,
        env: { PATH: `${spy.bin}:${process.env.PATH}` },
      });
      assert.notEqual(r.status, 0, wrap);
      assert.equal(readFileSync(spy.tarLog, "utf8").trim(), "");
      assert.equal(readFileSync(spy.nodeLog, "utf8").trim(), "");
    } finally {
      await srv.stop();
      rmSync(work, { recursive: true, force: true });
    }
  }
});
