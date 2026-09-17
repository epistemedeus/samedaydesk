#!/usr/bin/env node
/**
 * Cold follow-the-doc runner for docs/agent (useful-jobs 1.4.7).
 * Serves the committed public archive on loopback, executes tagged bash
 * fences from tutorial.md and how-to.md, and replays seeded failures the
 * docs say must be refused. No payment. No live merchant extract.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const docsDir = here;
const fixturePath = join(docsDir, "fixtures/seeded-failures.json");
const kitJsonPath = join(repoRoot, "client/src/data/usefulJobsKit.json");
const discoveryPath = join(repoRoot, "client/public/discovery/useful-jobs.json");
const publicRoot = join(repoRoot, "client/public");
const ARCHIVE_URL_PATH = "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz";
const EXPECTED_BYTES = 5255824;
const EXPECTED_SHA =
  "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec";

const FENCE_RE =
  /<!--\s*follow-the-doc:(step|seeded-failure)\s+id=([A-Za-z0-9_-]+)\s*-->\s*```(?:bash|sh)?\n([\s\S]*?)```/g;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function parseArgs(argv) {
  const out = { json: true, seededFailure: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--seeded-failure") {
      out.seededFailure = argv[i + 1] || "";
      i++;
    } else if (a.startsWith("--seeded-failure=")) {
      out.seededFailure = a.slice("--seeded-failure=".length);
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--") {
      break;
    } else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return out;
}

function extractTagged(md) {
  const steps = [];
  const failures = [];
  const re = new RegExp(FENCE_RE.source, "g");
  let m;
  while ((m = re.exec(md))) {
    const item = { kind: m[1], id: m[2], script: m[3].replace(/\s+$/, "") };
    if (item.kind === "step") steps.push(item);
    else failures.push(item);
  }
  return { steps, failures };
}

function readDocs() {
  const tutorial = readFileSync(join(docsDir, "tutorial.md"), "utf8");
  const howto = readFileSync(join(docsDir, "how-to.md"), "utf8");
  const reference = readFileSync(join(docsDir, "reference.md"), "utf8");
  const readme = readFileSync(join(docsDir, "README.md"), "utf8");
  const explanation = readFileSync(join(docsDir, "explanation.md"), "utf8");
  const fromTutorial = extractTagged(tutorial);
  const fromHowto = extractTagged(howto);
  return {
    tutorial,
    howto,
    reference,
    readme,
    explanation,
    steps: [...fromTutorial.steps, ...fromHowto.steps],
    failures: [...fromTutorial.failures, ...fromHowto.failures],
  };
}

function spawnAsync(cmd, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120000;
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolveP({
        status: timedOut ? 124 : status ?? 1,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

export function resolvePublicFile(root, reqUrl) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(String(reqUrl || "/").split("?")[0]);
  } catch {
    return { ok: false, status: 400, reason: "bad-url" };
  }
  if (urlPath.includes("\0")) {
    return { ok: false, status: 400, reason: "bad-url" };
  }
  const rel = urlPath.replace(/^\/+/, "");
  const file = resolve(root, rel);
  const relToRoot = relative(root, file);
  if (relToRoot === "" || relToRoot === ".." || relToRoot.startsWith(`..${sep}`)) {
    return { ok: false, status: 404, reason: "outside-root" };
  }
  let realRoot;
  let realFile;
  try {
    realRoot = realpathSync(root);
    realFile = realpathSync(file);
  } catch {
    return { ok: false, status: 404, reason: "missing" };
  }
  const relReal = relative(realRoot, realFile);
  if (relReal === "" || relReal === ".." || relReal.startsWith(`..${sep}`)) {
    return { ok: false, status: 404, reason: "outside-root" };
  }
  let st;
  try {
    st = statSync(realFile);
  } catch {
    return { ok: false, status: 404, reason: "missing" };
  }
  if (!st.isFile()) {
    return { ok: false, status: 404, reason: "not-a-file" };
  }
  return { ok: true, file: realFile };
}

export function servePublic({ poisonDigest = false } = {}) {
  const poison = poisonDigest ? Buffer.alloc(EXPECTED_BYTES, 0x5a) : null;
  const server = http.createServer((req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const urlPath = String(req.url || "/").split("?")[0];
      let decoded = urlPath;
      try {
        decoded = decodeURIComponent(urlPath);
      } catch {
        res.writeHead(400);
        res.end("bad request");
        return;
      }
      if (poisonDigest && decoded === ARCHIVE_URL_PATH) {
        res.writeHead(200, {
          "content-type": "application/gzip",
          "content-length": String(poison.length),
        });
        if (req.method === "HEAD") res.end();
        else res.end(poison);
        return;
      }
      const located = resolvePublicFile(publicRoot, urlPath);
      if (!located.ok) {
        res.writeHead(located.status);
        res.end(located.reason || "missing");
        return;
      }
      const buf = readFileSync(located.file);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(buf.length),
      });
      if (req.method === "HEAD") res.end();
      else res.end(buf);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("error");
      } else {
        res.destroy();
      }
    }
  });
  return new Promise((resolveP) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveP({
        origin: `http://127.0.0.1:${port}`,
        port,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
            if (typeof server.closeAllConnections === "function") {
              server.closeAllConnections();
            }
          }),
      });
    });
  });
}

function pinCheck(docs) {
  const archiveFile = join(publicRoot, ARCHIVE_URL_PATH.replace(/^\//, ""));
  const kitMirror = join(publicRoot, "kit/useful-jobs-1.4.7.tar.gz");
  const buf = readFileSync(archiveFile);
  const digest = sha256(buf);
  const kit = JSON.parse(readFileSync(kitJsonPath, "utf8"));
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const texts = [
    ["tutorial.md", docs.tutorial],
    ["how-to.md", docs.howto],
    ["reference.md", docs.reference],
    ["README.md", docs.readme],
    ["explanation.md", docs.explanation],
  ];
  const problems = [];
  if (buf.length !== EXPECTED_BYTES) {
    problems.push(`archive bytes ${buf.length} != ${EXPECTED_BYTES}`);
  }
  if (digest !== EXPECTED_SHA) {
    problems.push(`archive sha ${digest} != ${EXPECTED_SHA}`);
  }
  if (sha256(readFileSync(kitMirror)) !== EXPECTED_SHA) {
    problems.push("kit mirror sha mismatch");
  }
  if (kit.sha256 !== EXPECTED_SHA || kit.bytes !== EXPECTED_BYTES) {
    problems.push("usefulJobsKit.json pin drift");
  }
  if (discovery.sha256 !== EXPECTED_SHA || discovery.bytes !== EXPECTED_BYTES) {
    problems.push("discovery pin drift");
  }
  if (fixture.expectedSha256 !== EXPECTED_SHA || fixture.expectedBytes !== EXPECTED_BYTES) {
    problems.push("docs/agent fixture pin drift");
  }
  problems.push(...discoveryAuthorityProblems(discovery, kit));
  for (const [name, t] of texts) {
    if (!t.includes(EXPECTED_SHA)) problems.push(`${name} is missing the sha256 pin`);
    if (!t.includes(String(EXPECTED_BYTES))) problems.push(`${name} is missing the byte pin`);
  }
  const acquire = docs.steps.find((s) => s.id === "acquire");
  if (!acquire) problems.push("tutorial is missing tagged acquire step");
  else {
    if (!acquire.script.includes(`local bytes=${EXPECTED_BYTES}`)) {
      problems.push("acquire fence bytes pin drift");
    }
    if (!acquire.script.includes(`local sha=${EXPECTED_SHA}`)) {
      problems.push("acquire fence sha pin drift");
    }
    if (acquire.script.trim() !== String(discovery.coldStart).trim()) {
      problems.push("acquire fence is not the published discovery.coldStart");
    }
  }
  const requiredSteps = [
    "acquire",
    "list-help",
    "example-lockfile",
    "caller-alpha",
    "caller-repeat",
    "page-held",
  ];
  for (const id of requiredSteps) {
    if (!docs.steps.some((s) => s.id === id)) problems.push(`missing step ${id}`);
  }
  for (const spec of fixture.failures) {
    if (spec.kind === "cli" && !docs.failures.some((s) => s.id === spec.id)) {
      problems.push(`missing seeded fence ${spec.id}`);
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    archive: {
      path: ARCHIVE_URL_PATH,
      bytes: buf.length,
      sha256: digest,
      matchedDocs: problems.length === 0,
      matchedFile: digest === EXPECTED_SHA && buf.length === EXPECTED_BYTES,
    },
    kitVersion: kit.version,
    discoveryVersion: discovery.version,
  };
}

function bashEnv({ origin, cwd }) {
  return {
    ...process.env,
    USEFUL_JOBS_ORIGIN: origin,
    TMPDIR: cwd,
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    NO_PROXY: "*",
    PYTHONOPTIMIZE: "2",
  };
}

function kitExtracted(dir) {
  try {
    return readdirSync(dir, { recursive: true }).some((n) =>
      String(n).replaceAll("\\", "/").endsWith("useful-jobs-1.4.7/bin/useful-jobs.mjs"),
    );
  } catch {
    return false;
  }
}

async function runAcquireOnly({ origin, cwd, acquireScript }) {
  const script = `set -euo pipefail
${acquireScript}
`;
  return spawnAsync("bash", ["-c", script], { cwd, env: bashEnv({ origin, cwd }) });
}

async function runHappyPath({ origin, cwd, docs }) {
  if (!docs.steps.length) throw new Error("missing follow-the-doc steps");
  const parts = [];
  for (const step of docs.steps) {
    parts.push(`# step ${step.id}\n${step.script}\n`);
  }
  const script = `set -euo pipefail
${parts.join("\n")}
printf 'KIT=%s\\n' "$kit"
`;
  const r = await spawnAsync("bash", ["-c", script], {
    cwd,
    env: bashEnv({ origin, cwd }),
  });
  const kitLine = String(r.stdout || "")
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("KIT="))
    .pop();
  const kit = kitLine ? kitLine.slice(4) : "";
  return { ...r, kit };
}

async function runCliFailure({ kit, cwd, fence }) {
  const script = `set -euo pipefail
kit=${JSON.stringify(kit)}
set +e
${fence.script}
status=$?
set -e
exit $status
`;
  return spawnAsync("bash", ["-c", script], {
    cwd,
    env: bashEnv({ origin: "http://127.0.0.1:0", cwd }),
  });
}

function matchOutput(r, pattern) {
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  return new RegExp(pattern, "i").test(text);
}

export function discoveryAuthorityProblems(discovery, kit) {
  const problems = [];
  if (discovery.version !== "1.4.7" || kit.version !== "1.4.7") {
    problems.push("version pin drift");
  }
  for (const [name, obj] of [
    ["discovery", discovery],
    ["kit", kit],
  ]) {
    if (obj.purchaseAuthority !== false) {
      problems.push(`${name} purchaseAuthority must be false`);
    }
    if (obj.paidHostedClaim !== false) {
      problems.push(`${name} paidHostedClaim must be false`);
    }
    if (obj.schedulerDaemon !== false) {
      problems.push(`${name} schedulerDaemon must be false`);
    }
  }
  if (
    discovery.archive?.sha256 !== EXPECTED_SHA ||
    discovery.archive?.bytes !== EXPECTED_BYTES
  ) {
    problems.push("discovery.archive pin drift");
  }
  return problems;
}

function readJsonDigest(file) {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return typeof j.digest === "string" && j.digest ? j.digest : null;
  } catch {
    return null;
  }
}

export function expectSeededRejected(spec, r, extra = {}) {
  if (!spec?.expect) return r.status !== 0;
  const expect = spec.expect;
  if (expect.exitNonZero && r.status === 0) return false;
  if (expect.extracted === false && extra.extracted) return false;
  if (expect.executed === false && extra.executed) return false;
  if (expect.outputMatches && !matchOutput(r, expect.outputMatches)) return false;
  return true;
}

export async function runFollowTheDoc({ seededFailure = null } = {}) {
  const docs = readDocs();
  const pins = pinCheck(docs);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const knownIds = new Set(fixture.failures.map((f) => f.id));
  const wanted =
    seededFailure && seededFailure !== "all"
      ? [seededFailure]
      : fixture.failures.map((f) => f.id);
  const unknownWanted = wanted.filter((id) => !knownIds.has(id));

  if (!pins.ok) {
    return {
      ok: false,
      code: "pin-drift",
      surface: "useful-jobs",
      version: "1.4.7",
      paid: false,
      pins,
      tutorial: null,
      seededFailures: [],
      problems: pins.problems,
    };
  }

  if (unknownWanted.length) {
    return {
      ok: false,
      code: "unknown-seeded-failure",
      surface: "useful-jobs",
      version: "1.4.7",
      paid: false,
      liveMerchantExtract: false,
      pins: pins.archive,
      tutorial: null,
      seededFailures: [],
      problems: unknownWanted.map((id) => `unknown seeded-failure ${id}`),
    };
  }

  const work = mkdtempSync(join(tmpdir(), "ftd-uj-"));
  const seeded = [];
  let tutorial = null;
  try {
    if (wanted.includes("digest-mismatch")) {
      const poisonWork = mkdtempSync(join(work, "poison-"));
      const poison = await servePublic({ poisonDigest: true });
      try {
        const acquire = docs.steps.find((s) => s.id === "acquire");
        const r = await runAcquireOnly({
          origin: poison.origin,
          cwd: poisonWork,
          acquireScript: acquire.script,
        });
        const extracted = kitExtracted(poisonWork);
        const spec = fixture.failures.find((f) => f.id === "digest-mismatch");
        const rejected = expectSeededRejected(spec, r, {
          extracted,
          executed: extracted,
        });
        seeded.push({
          id: "digest-mismatch",
          rejected,
          exitCode: r.status,
          extracted,
          stdout: String(r.stdout || "").slice(0, 400),
          stderr: String(r.stderr || "").slice(0, 400),
        });
      } finally {
        await poison.stop();
      }
    }

    const needCli = wanted.some((id) => {
      const spec = fixture.failures.find((f) => f.id === id);
      return spec && spec.kind === "cli";
    });
    const needHappy =
      !seededFailure || seededFailure === "all" || needCli;
    if (needHappy) {
      const srv = await servePublic({ poisonDigest: false });
      const happyWork = mkdtempSync(join(work, "happy-"));
      try {
        const r = await runHappyPath({ origin: srv.origin, cwd: happyWork, docs });
        const kitOk = Boolean(r.kit) && existsSync(join(r.kit, "bin/useful-jobs.mjs"));
        const exampleOk =
          /"ok"\s*:\s*true/.test(r.stdout) || /"ok"\s*:\s*true/.test(r.stderr);
        const listMatched = /lockfile-pin-delta/.test(r.stdout + r.stderr);
        const d1 = readJsonDigest(
          join(happyWork, "out/caller-alpha/upgrade-brief.json"),
        );
        const d2 = readJsonDigest(
          join(happyWork, "out/caller-alpha-repeat/upgrade-brief.json"),
        );
        const repeatChanged = Boolean(d1 && d2 && d1 !== d2);
        const pageChangeOk = existsSync(
          join(happyWork, "out/page-h04/page-change.json"),
        );
        tutorial = {
          exitCode: r.status,
          kit: r.kit,
          kitOk,
          listMatched,
          exampleOk,
          repeatChanged,
          pageChangeOk,
          stdoutTail: String(r.stdout || "").slice(-800),
          stderrTail: String(r.stderr || "").slice(-800),
        };

        if (r.status === 0 && kitOk) {
          for (const spec of fixture.failures) {
            if (!wanted.includes(spec.id) || spec.kind !== "cli") continue;
            const fence = docs.failures.find((f) => f.id === spec.id);
            if (!fence) {
              seeded.push({
                id: spec.id,
                rejected: false,
                exitCode: 1,
                output: "missing tagged fence",
              });
              continue;
            }
            const fr = await runCliFailure({ kit: r.kit, cwd: happyWork, fence });
            seeded.push({
              id: spec.id,
              rejected: expectSeededRejected(spec, fr),
              exitCode: fr.status,
              output: `${fr.stdout}\n${fr.stderr}`.slice(0, 600),
            });
          }
        }
      } finally {
        await srv.stop();
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const happyOk = tutorial
    ? Boolean(
        tutorial.exitCode === 0 &&
          tutorial.kitOk &&
          tutorial.listMatched &&
          tutorial.exampleOk &&
          tutorial.repeatChanged &&
          tutorial.pageChangeOk,
      )
    : wanted.every((id) => id === "digest-mismatch");
  const seededOk =
    seeded.length === wanted.length && seeded.every((s) => s.rejected === true);
  const problems = [];
  if (!happyOk) problems.push("tutorial follow-the-doc did not succeed");
  if (!seededOk) problems.push("a seeded failure was not rejected");
  if (tutorial && tutorial.exitCode !== 0 && (!seededFailure || seededFailure === "all")) {
    problems.push(`tutorial exit ${tutorial.exitCode}`);
  }

  return {
    ok: happyOk && seededOk && pins.ok,
    surface: "useful-jobs",
    version: "1.4.7",
    paid: false,
    liveMerchantExtract: false,
    pins: pins.archive,
    tutorial,
    seededFailures: seeded,
    problems,
  };
}

function printHelp() {
  process.stdout.write(`Usage:
  node docs/agent/follow-the-doc.mjs
  node docs/agent/follow-the-doc.mjs --seeded-failure digest-mismatch
  node docs/agent/follow-the-doc.mjs --seeded-failure missing-required-inputs
  node docs/agent/follow-the-doc.mjs --seeded-failure example-on-page-change

Serves client/public on loopback, follows tagged fences in tutorial.md and
how-to.md, and requires seeded failures to be refused. No payment.
`);
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const result = await runFollowTheDoc({
      seededFailure: args.seededFailure,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, code: "runner-error", message: String(err?.message || err) }, null, 2)}\n`,
    );
    process.exit(1);
  }
}
