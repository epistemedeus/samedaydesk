#!/usr/bin/env node
/**
 * N5-E06 measurement driver.
 * It checks an explicit source root, then runs the published useful-jobs
 * lifecycle twice: the documented acquire function with a direct pin change,
 * and npm install of the hosted tarball URL. It does not install a new
 * runtime, catalog, or package manager.
 */

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(SCRIPT_DIR, "consumer");

const DECLARED_BASE = "09b2d6155ce247d828355183c9367889daf5f0f0";
const DECLARED_TREE = "0619ee40acd45537fe1fde8723d07152ef09508a";
const INPUT_COMMIT = "9f6c0c4e396dd7677f334400eed93e3445fad600";
const INPUT_TREE = "8a85072962a71dc1b78b19a0dc0caf17aebac833";
const EMBED_COMMIT = "1003b9ec6c3d46826f54a398fce4bb6d0821596f";

const ADMITTED = Object.freeze({
  "server/lib/observatory/maintained-capability.js": "b3691bced66e8c4f42e351d5c96be1962748a2bb",
  "server/scripts/test-capability-owner-lookup.js": "369b11c4f3a55162444c8080ef64881f3d09db4a",
  "client/public/discovery/useful-jobs.json": "de32575ea85e28aa6113b488e76cbb9f1c795b56",
  "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz": "d8aecf276ce2eb23f4d30f5575085bc992134841",
});

const PIN_A = Object.freeze({
  version: "1.4.0",
  bytes: 2575215,
  sha256: "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
  url: "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz",
});
const PIN_B = Object.freeze({
  version: "1.4.7",
  bytes: 5255824,
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  url: "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
});
const TEMPLATE = Object.freeze({
  bytes: "5255824",
  sha256: PIN_B.sha256,
  token: "useful-jobs-1.4.7",
});

const SAMPLES = Object.freeze({
  budgetBefore: ["samples/pricing/caller-alpha/before.json", "2f588d099ff80988351ab08e853718654ab8110edbf457842430f53bb35c571b"],
  budgetAfter: ["samples/pricing/caller-alpha/after.json", "6338395eece27ac3c34a021a9c4d68028e210781e1c4d4213f516498246e7325"],
  feedBefore: ["samples/feed/caller-alpha/before.xml", "a8e8069d6cc8bba57991d0059e5a102e836bb6e7620be3af07958a111f3b6c8d"],
  feedAfter: ["samples/feed/caller-alpha/after.xml", "19de60739c32942d5a65b0597284e55b8bf31bc84eab81815c65076913cfa227"],
});

const PACKAGE_DIGEST = Object.freeze({
  budgetA: "0c8a43129eaa451a",
  budgetB: "0ea6c814c944ec14",
  feed: "9566ea587f0e4af9",
});
const PROBE_DIGEST = Object.freeze({
  budgetA: "4cf1620d170c8435",
  budgetB: "b8245c80c8880801",
  feed: "5cce807b297f4972",
});
const BAD_INTEGRITY = "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const UNRELATED = [
  "LABEL.txt",
  "NOTES.txt",
  "scripts/note.mjs",
  "sibling/package.json",
  "sibling/marker.txt",
];

const commands = [];
let evidenceDir = "";

function clip(text, limit = 4000) {
  const value = String(text ?? "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...[clipped ${value.length - limit} chars]`;
}

function record(entry) {
  commands.push(entry);
  if (!evidenceDir) return;
  appendFileSync(join(evidenceDir, "commands.jsonl"), `${JSON.stringify(entry)}\n`);
}

function gitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

function runCmd(command, args, opts = {}) {
  const started = Date.now();
  const res = spawnSync(command, args, {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    timeout: opts.timeout ?? 180000,
    maxBuffer: 10 * 1024 * 1024,
    killSignal: "SIGKILL",
  });
  record({
    step: opts.step ?? command,
    command: opts.display ?? [command, ...args].join(" "),
    cwd: opts.cwd ?? null,
    status: res.status,
    signal: res.signal ?? null,
    error: res.error ? res.error.message : null,
    ms: Date.now() - started,
    show: opts.show !== false,
    stdout: clip(res.stdout),
    stderr: clip(res.stderr),
  });
  return Object.assign(res, { ms: Date.now() - started });
}

function git(cwd, args) {
  return runCmd("git", args, {
    cwd,
    env: gitEnv(),
    step: `git ${args[0]}`,
    show: false,
    timeout: 30000,
  });
}

function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(readFileSync(file));
  return hash.digest("hex");
}

function sha512Integrity(file) {
  return `sha512-${createHash("sha512").update(readFileSync(file)).digest("base64")}`;
}

function parseArgs(argv) {
  const out = { sourceRoot: "", evidence: "", workspace: "", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--source-root") out.sourceRoot = argv[++i] ?? "";
    else if (arg === "--evidence") out.evidence = argv[++i] ?? "";
    else if (arg === "--workspace") out.workspace = argv[++i] ?? "";
    else {
      process.stderr.write(`source-root-refused: unknown-argument ${arg}\n`);
      process.exit(2);
    }
  }
  return out;
}

function refuse(reason) {
  process.stderr.write(`source-root-refused: ${reason}\n`);
  process.exit(2);
}

function verifySource(sourceRoot) {
  if (!sourceRoot) refuse("missing");
  if (!existsSync(sourceRoot)) refuse("missing");
  const root = resolve(sourceRoot);
  let info;
  try {
    info = statSync(root);
  } catch {
    refuse("missing");
  }
  if (!info.isDirectory()) refuse("not-a-directory");

  const head = git(root, ["rev-parse", "HEAD"]);
  if (head.status !== 0) refuse("git-failed");
  const commit = head.stdout.trim();
  if (commit !== INPUT_COMMIT) refuse(`commit-mismatch ${commit}`);

  const treeRun = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (treeRun.status !== 0) refuse("git-failed");
  const tree = treeRun.stdout.trim();
  if (tree !== INPUT_TREE) refuse(`tree-mismatch ${tree}`);

  const paths = Object.keys(ADMITTED);
  const listed = git(root, ["ls-tree", "-r", "HEAD", "--", ...paths]);
  if (listed.status !== 0) refuse("git-failed");
  const found = new Map();
  for (const line of listed.stdout.split("\n")) {
    if (!line) continue;
    const match = line.match(/^100644 blob ([0-9a-f]{40})\t(.+)$/);
    if (!match) refuse("blob-mismatch unparsed");
    found.set(match[2], match[1]);
  }
  for (const [path, blob] of Object.entries(ADMITTED)) {
    if (found.get(path) !== blob) refuse(`blob-mismatch ${path}`);
  }

  for (const path of paths) {
    const hashed = git(root, ["hash-object", path]);
    if (hashed.status !== 0 || hashed.stdout.trim() !== ADMITTED[path]) refuse(`dirty-worktree ${path}`);
  }

  const archive = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz");
  const archiveStat = statSync(archive);
  const archiveSha = sha256File(archive);
  if (archiveStat.size !== PIN_B.bytes || archiveSha !== PIN_B.sha256) refuse("archive-sha-mismatch");

  const ancestor = git(root, ["merge-base", "--is-ancestor", EMBED_COMMIT, "HEAD"]);
  if (ancestor.status !== 0) refuse("embed-not-ancestor");

  return { root, commit, tree, archiveSha, archiveBytes: archiveStat.size };
}

function writerCheckout() {
  const top = git(SCRIPT_DIR, ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) return null;
  const root = top.stdout.trim();
  const head = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const declaredTree = git(root, ["rev-parse", `${DECLARED_BASE}^{tree}`]);
  const merged = git(root, ["merge-base", "--is-ancestor", INPUT_COMMIT, "HEAD"]);
  return {
    root,
    commit: head.stdout.trim(),
    tree: tree.stdout.trim(),
    branch: branch.stdout.trim(),
    declaredTree: declaredTree.status === 0 ? declaredTree.stdout.trim() : "",
    releaseHistoryMerged: merged.status === 0,
  };
}

function fileMap(dir, paths) {
  const out = {};
  for (const rel of paths) {
    const abs = join(dir, rel);
    out[rel] = existsSync(abs) ? sha256File(abs) : null;
  }
  return out;
}

function sameMap(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const changes = [];
  for (const key of keys) {
    if (left[key] !== right[key]) changes.push(key);
  }
  return changes;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function pinScript(coldStart, pin) {
  if (!coldStart.startsWith("useful_jobs_acquire() {")) throw new Error("acquire template drift");
  if (coldStart.split(TEMPLATE.bytes).length !== 2) throw new Error("acquire bytes drift");
  if (coldStart.split(TEMPLATE.sha256).length !== 2) throw new Error("acquire sha drift");
  if (coldStart.split(TEMPLATE.token).length !== 4) throw new Error("acquire version drift");
  let next = coldStart.replace(TEMPLATE.bytes, String(pin.bytes));
  next = next.replace(TEMPLATE.sha256, pin.sha256);
  next = next.replaceAll(TEMPLATE.token, `useful-jobs-${pin.version}`);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function writeScript(dir, name, body) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

function downloadVerified(url, dest, pin) {
  if (existsSync(dest)) rmSync(dest);
  const res = runCmd("curl", ["-fsSL", "--max-time", "60", "-o", dest, url], {
    step: `curl ${pin.version}`,
    display: `curl -fsSL --max-time 60 -o ${dest} ${url}`,
  });
  if (res.status !== 0) {
    if (existsSync(dest)) rmSync(dest);
    throw new Error(`download ${pin.version} failed status ${res.status}`);
  }
  const size = statSync(dest).size;
  const sha = sha256File(dest);
  if (size !== pin.bytes || sha !== pin.sha256) {
    rmSync(dest);
    throw new Error(`verified ${pin.version} bytes ${size} sha ${sha}`);
  }
  return { size, sha256: sha, integrity: sha512Integrity(dest), path: dest };
}

function curlStatus(url, step) {
  const res = runCmd("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "60", url], {
    step,
    display: `curl -sS -o /dev/null -w %{http_code} ${url}`,
  });
  return { status: res.status, http: String(res.stdout).trim(), stderr: res.stderr };
}

function curlFail(url, step) {
  const res = runCmd("curl", ["-fsS", "-o", "/dev/null", "--max-time", "60", url], {
    step,
    display: `curl -fsS -o /dev/null ${url}`,
  });
  return { status: res.status, stderr: res.stderr };
}

function acquire(script, env, step) {
  const notes = [];
  if (env.USEFUL_JOBS_ORIGIN) notes.push(`USEFUL_JOBS_ORIGIN=${env.USEFUL_JOBS_ORIGIN}`);
  if (env.PATH && env.PATH !== process.env.PATH) notes.push("PATH=tar-killer:...");
  const suffix = notes.length ? ` (${notes.join(" ")})` : "";
  return runCmd("bash", [script], {
    step,
    display: `bash ${script}${suffix}`,
    env,
    cwd: dirname(script),
  });
}

function kitFrom(result) {
  const line = String(result.stdout || "").trim().split("\n").filter(Boolean).pop() || "";
  return line;
}

function packageVersion(kit) {
  return readJson(join(kit, "package.json")).version;
}

function runTool(kit, args, step) {
  return runCmd(process.execPath, args, {
    cwd: kit,
    step,
    display: `node ${args.join(" ")}`,
  });
}

function parseStdout(result) {
  const line = String(result.stdout || "").trim().split("\n").filter(Boolean).pop() || "";
  return JSON.parse(line);
}

function checkSamples(kit) {
  for (const [rel, sha] of Object.values(SAMPLES)) {
    const got = sha256File(join(kit, rel));
    if (got !== sha) throw new Error(`sample ${rel} sha ${got}`);
  }
}

function bindRun(bind, recipe, values, outDir) {
  const argv = bind(recipe, values);
  if (!argv || argv[0] !== "node") throw new Error("call recipe did not bind");
  return argv.slice(1).concat(["--out-dir", outDir]);
}

function stableWithout(file, keys) {
  const body = readJson(file);
  for (const key of keys) delete body[key];
  return body;
}

function feedFilesMatch(leftDir, rightDir) {
  const left = stableWithout(join(leftDir, "agenda.json"), ["generatedAt"]);
  const right = stableWithout(join(rightDir, "agenda.json"), ["generatedAt"]);
  const jsonSame = JSON.stringify(left) === JSON.stringify(right);
  const leftIcs = readFileSync(join(leftDir, "agenda.ics"), "utf8").split(/\r?\n/);
  const rightIcs = readFileSync(join(rightDir, "agenda.ics"), "utf8").split(/\r?\n/);
  if (leftIcs.length !== rightIcs.length) return { jsonSame, icsSame: false, icsDiff: ["length"] };
  const icsDiff = [];
  for (let i = 0; i < leftIcs.length; i += 1) {
    if (leftIcs[i] !== rightIcs[i] && !leftIcs[i].startsWith("DTSTAMP:") && !rightIcs[i].startsWith("DTSTAMP:")) {
      icsDiff.push(leftIcs[i]);
    }
  }
  return { jsonSame, icsSame: icsDiff.length === 0, icsDiff };
}

function assertBudget(art, pin) {
  if (art.status !== "actionable") throw new Error(`${pin} budget status ${art.status}`);
  if (art.purchaseAuthority !== false) throw new Error(`${pin} purchase authority`);
  const change = (art.actions || []).find((item) => item.kind === "review-price-field");
  if (!change) throw new Error(`${pin} missing review-price-field`);
  if (pin === "A") {
    if (art.digest !== PACKAGE_DIGEST.budgetA) throw new Error(`A digest ${art.digest}`);
    if (!String(art.summary).startsWith("Budget-impact scan: fieldChanges=1")) throw new Error(`A summary ${art.summary}`);
    if (Object.hasOwn(change, "beforeValue") || Object.hasOwn(change, "delta")) throw new Error("A included numeric delta");
    if (Object.hasOwn(art, "scope")) throw new Error("A included scope");
  } else {
    if (art.digest !== PACKAGE_DIGEST.budgetB) throw new Error(`B digest ${art.digest}`);
    if (change.beforeValue !== 1.25 || change.afterValue !== 1.75 || change.delta !== 0.5) {
      throw new Error(`B delta ${JSON.stringify(change)}`);
    }
    if (change.unit !== "USD/1M-tokens") throw new Error(`B unit ${change.unit}`);
    if (art.scope?.billCalculation !== false || art.scope?.liveQuote !== false) throw new Error("B scope");
  }
  return { digest: art.digest, summary: art.summary, change };
}

function assertFeed(art) {
  if (art.status !== "actionable") throw new Error(`feed status ${art.status}`);
  if (art.digest !== PACKAGE_DIGEST.feed) throw new Error(`feed digest ${art.digest}`);
  if (!Array.isArray(art.events) || art.events.length !== 2) throw new Error(`feed events ${art.events?.length}`);
  return { digest: art.digest, events: art.events.length, summary: art.summary };
}

function runJobs(kit, bind, recipes, outRoot, label) {
  checkSamples(kit);
  const budgetDir = join(outRoot, `${label}-budget`);
  const feedDir = join(outRoot, `${label}-feed`);
  mkdirSync(budgetDir, { recursive: true });
  mkdirSync(feedDir, { recursive: true });
  const budgetArgs = bindRun(bind, recipes.budget, {
    "--before": SAMPLES.budgetBefore[0],
    "--after": SAMPLES.budgetAfter[0],
  }, budgetDir);
  const feedArgs = bindRun(bind, recipes.feed, {
    "--before": SAMPLES.feedBefore[0],
    "--after": SAMPLES.feedAfter[0],
  }, feedDir);
  const budgetRun = runTool(kit, budgetArgs, `${label} vendor-budget-impact`);
  const feedRun = runTool(kit, feedArgs, `${label} feed-agenda`);
  if (budgetRun.status !== 0) throw new Error(`${label} budget exit ${budgetRun.status}`);
  if (feedRun.status !== 0) throw new Error(`${label} feed exit ${feedRun.status}`);
  const budgetStdout = parseStdout(budgetRun);
  const feedStdout = parseStdout(feedRun);
  const budget = assertBudget(readJson(join(budgetDir, "budget-impact.json")), label.endsWith("B") || label === "B" ? "B" : "A");
  const feed = assertFeed(readJson(join(feedDir, "agenda.json")));
  if (budgetStdout.digest !== budget.digest || feedStdout.digest !== feed.digest) {
    throw new Error(`${label} stdout digest mismatch`);
  }
  if (feedStdout.events !== 2) throw new Error(`${label} stdout events`);
  return { budgetDir, feedDir, budget, feed, budgetStdout, feedStdout };
}

function copyOutputs(measured, fromDir, name) {
  const dest = join(evidenceDir, name);
  mkdirSync(dest, { recursive: true });
  for (const file of ["budget-impact.json", "budget-impact.md", "agenda.json", "agenda.ics"]) {
    const src = join(fromDir, file);
    if (existsSync(src)) copyFileSync(src, join(dest, file));
  }
  measured.outputs = measured.outputs ?? [];
  measured.outputs.push(name);
}

function startOrigin(script, file, urlPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, file, urlPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("origin server did not listen"));
    }, 5000);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const line = buf.split("\n")[0].trim();
      if (!/^\d+$/.test(line) || settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        origin: `http://127.0.0.1:${line}`,
        close() {
          child.kill("SIGTERM");
          return new Promise((done) => child.on("close", () => done()));
        },
      });
    });
  });
}

function localEnv(baseEnv, origin) {
  const prior = [process.env.NO_PROXY, process.env.no_proxy, "127.0.0.1,localhost"].filter(Boolean).join(",");
  return {
    ...baseEnv,
    USEFUL_JOBS_ORIGIN: origin,
    NO_PROXY: prior,
    no_proxy: prior,
  };
}

function workDirs(tmp) {
  return readdirSync(tmp).filter((name) => name.startsWith("useful-jobs.")).sort();
}

function assertSameDirs(tmp, before, label) {
  const after = workDirs(tmp);
  if (before.join() !== after.join()) throw new Error(`${label} left work dirs ${after.join(",")}`);
}

function noteStdout(consumer) {
  const res = runCmd(process.execPath, [join(consumer, "scripts/note.mjs")], {
    cwd: consumer,
    step: "consumer note",
    show: false,
  });
  if (res.status !== 0) throw new Error("unrelated note script failed");
  return res.stdout;
}

function npmLs(consumer, spec) {
  const res = runCmd("npm", ["ls", spec, "--depth=0"], {
    cwd: consumer,
    step: `npm ls ${spec}`,
  });
  return { status: res.status, stdout: String(res.stdout || "") };
}

function installSibling(consumer) {
  const res = runCmd("npm", ["install"], {
    cwd: consumer,
    step: "npm install sibling",
    display: "npm install",
  });
  if (res.status !== 0) throw new Error("sibling install failed");
}

function npmInstallUrl(consumer, url, step) {
  return runCmd("npm", ["install", url], {
    cwd: consumer,
    step,
    display: `npm install ${url}`,
  });
}

function installedVersion(consumer) {
  const file = join(consumer, "node_modules/useful-jobs/package.json");
  if (!existsSync(file)) return null;
  return readJson(file).version;
}

function lockEntry(consumer) {
  const lock = readJson(join(consumer, "package-lock.json"));
  return lock.packages?.["node_modules/useful-jobs"] ?? null;
}

function saveSpec(consumer, destDir) {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(join(consumer, "package.json"), join(destDir, "package.json"));
  copyFileSync(join(consumer, "package-lock.json"), join(destDir, "package-lock.json"));
}

function restoreSpec(consumer, destDir) {
  copyFileSync(join(destDir, "package.json"), join(consumer, "package.json"));
  copyFileSync(join(destDir, "package-lock.json"), join(consumer, "package-lock.json"));
}

function specSame(consumer, destDir) {
  return sha256File(join(consumer, "package.json")) === sha256File(join(destDir, "package.json"))
    && sha256File(join(consumer, "package-lock.json")) === sha256File(join(destDir, "package-lock.json"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("usage: run.mjs --source-root <detached-input-worktree> [--evidence dir] [--workspace dir]\n");
    return;
  }
  if (!args.sourceRoot) refuse("missing");

  const source = verifySource(args.sourceRoot);
  const writer = writerCheckout();
  if (!writer) refuse("writer-git-failed");
  if (writer.releaseHistoryMerged) refuse("release-history-merged");
  if (writer.declaredTree !== DECLARED_TREE) refuse("declared-tree-mismatch");

  const sentinel = mkdtempSync(join(tmpdir(), "n5-e06-sentinel-"));
  const marker = join(sentinel, "marker.txt");
  writeFileSync(marker, "sentinel-v1\n");
  mkdirSync(join(sentinel, "empty"));
  const markerSha = sha256File(marker);
  const scriptPath = fileURLToPath(import.meta.url);
  const refusalCases = [
    ["missing", join(sentinel, "no-such-source-root")],
    ["writer-checkout", writer.root],
    ["empty-dir", join(sentinel, "empty")],
  ];
  const refusals = [];
  for (const [name, root] of refusalCases) {
    const evidence = join(sentinel, `evidence-${name}`);
    const workspace = join(sentinel, `work-${name}`);
    const child = runCmd(process.execPath, [
      scriptPath,
      "--source-root",
      root,
      "--evidence",
      evidence,
      "--workspace",
      workspace,
    ], {
      step: `refuse ${name}`,
      display: `node run.mjs --source-root ${root}`,
      timeout: 30000,
    });
    refusals.push({
      name,
      status: child.status,
      stderr: clip(child.stderr, 500),
      evidenceCreated: existsSync(evidence),
      workspaceCreated: existsSync(workspace),
    });
    if (child.status !== 2) throw new Error(`refusal ${name} status ${child.status}`);
    if (!String(child.stderr).includes("source-root-refused:")) throw new Error(`refusal ${name} missing marker`);
    if (existsSync(evidence) || existsSync(workspace)) throw new Error(`refusal ${name} wrote files`);
  }
  if (sha256File(marker) !== markerSha) throw new Error("sentinel marker changed");
  if (readdirSync(join(sentinel, "empty")).length !== 0) throw new Error("empty source dir changed");
  rmSync(sentinel, { recursive: true, force: true });

  evidenceDir = resolve(args.evidence || join(SCRIPT_DIR, "evidence"));
  rmSync(evidenceDir, { recursive: true, force: true });
  mkdirSync(evidenceDir, { recursive: true });
  for (const entry of commands) appendFileSync(join(evidenceDir, "commands.jsonl"), `${JSON.stringify(entry)}\n`);

  const workspace = args.workspace
    ? resolve(args.workspace)
    : mkdtempSync(join(tmpdir(), "n5-e06-work-"));
  mkdirSync(workspace, { recursive: true });
  const tmp = join(workspace, "tmp");
  mkdirSync(tmp, { recursive: true });
  const baseEnv = gitEnv({ TMPDIR: tmp });

  const started = Date.now();
  const setupStarted = Date.now();
  const mod = await import(pathToFileURL(join(source.root, "server/lib/observatory/maintained-capability.js")).href);
  const discovery = readJson(join(source.root, "client/public/discovery/useful-jobs.json"));
  if (discovery.version !== PIN_B.version || discovery.releaseScope.approvedVersion !== PIN_B.version) {
    throw new Error("discovery approved version drift");
  }
  if (discovery.previous.version !== PIN_A.version || discovery.previous.sha256 !== PIN_A.sha256 || discovery.previous.bytes !== PIN_A.bytes) {
    throw new Error("discovery previous pin drift");
  }
  if (discovery.archive.sha256 !== PIN_B.sha256 || discovery.archive.bytes !== PIN_B.bytes || discovery.archive.url !== PIN_B.url) {
    throw new Error("discovery archive drift");
  }
  const previousUrl = new URL(discovery.previous.archive, "https://samedaydesk.com").href;
  if (previousUrl !== PIN_A.url) throw new Error("discovery previous url drift");
  if (!discovery.releaseScope.neverPublishedAsPublicDownloads.includes("1.4.6")) throw new Error("1.4.6 not listed never-published");

  const budgetOwner = mod.lookupCapabilityOwner("vendor-budget-impact");
  const feedOwner = mod.lookupCapabilityOwner("feed-agenda");
  const unknownOwner = mod.lookupCapabilityOwner("no-such-job");
  const wrongVersion = structuredClone(discovery);
  wrongVersion.version = PIN_A.version;
  const versionOwner = mod.lookupCapabilityOwner("vendor-budget-impact", wrongVersion);
  if (budgetOwner.outcome !== "owned" || budgetOwner.version !== PIN_B.version || budgetOwner.review !== "newly_reviewed") {
    throw new Error(`budget lookup ${budgetOwner.outcome} ${budgetOwner.reason}`);
  }
  if (feedOwner.outcome !== "owned" || feedOwner.review !== "inherited") throw new Error("feed lookup");
  if (JSON.stringify(budgetOwner.callRecipe.requiredInputs) !== JSON.stringify(["--before", "--after"])) throw new Error("budget flags");
  if (JSON.stringify(feedOwner.callRecipe.requiredInputs) !== JSON.stringify(["--before", "--after"])) throw new Error("feed flags");
  if (budgetOwner.callRecipe.acquire !== discovery.coldStart) throw new Error("acquire recipe drift");
  if (unknownOwner.reason !== "unknown_need" || unknownOwner.callRecipe !== null) throw new Error("unknown lookup");
  if (versionOwner.reason !== "version_not_approved" || versionOwner.callRecipe !== null) throw new Error("version lookup");

  const cache = join(workspace, "cache");
  mkdirSync(cache, { recursive: true });
  const hostedA = downloadVerified(PIN_A.url, join(cache, "useful-jobs-1.4.0.tar.gz"), PIN_A);
  const hostedB = downloadVerified(PIN_B.url, join(cache, "useful-jobs-1.4.7.tar.gz"), PIN_B);
  const setupDownloadMs = Date.now() - setupStarted;

  const scriptDir = join(evidenceDir, "scripts");
  const scriptA = writeScript(scriptDir, "acquire-1.4.0.sh", pinScript(discovery.coldStart, PIN_A));
  const scriptB = writeScript(scriptDir, "acquire-1.4.7.sh", pinScript(discovery.coldStart, PIN_B));
  const script146 = writeScript(scriptDir, "acquire-1.4.6.sh", pinScript(discovery.coldStart, {
    version: "1.4.6",
    bytes: PIN_B.bytes,
    sha256: PIN_B.sha256,
  }));
  const script999 = writeScript(scriptDir, "acquire-9.9.9.sh", pinScript(discovery.coldStart, {
    version: "9.9.9",
    bytes: PIN_B.bytes,
    sha256: PIN_B.sha256,
  }));
  const badSha = `${PIN_B.sha256.slice(0, -1)}e`;
  const scriptBad = writeScript(scriptDir, "acquire-bad-sha.sh", pinScript(discovery.coldStart, {
    version: PIN_B.version,
    bytes: PIN_B.bytes,
    sha256: badSha,
  }));

  const recipes = { budget: budgetOwner.callRecipe, feed: feedOwner.callRecipe };
  const measured = {
    identity: {
      declaredBase: DECLARED_BASE,
      declaredTree: DECLARED_TREE,
      writerCommit: writer.commit,
      writerTree: writer.tree,
      writerBranch: writer.branch,
      inputCommit: source.commit,
      inputTree: source.tree,
      embedCommit: EMBED_COMMIT,
      admitted: ADMITTED,
      releaseHistoryMerged: false,
      node: process.version,
    },
    archives: { A: hostedA, B: hostedB },
    embed: {
      budget: { outcome: budgetOwner.outcome, version: budgetOwner.version, review: budgetOwner.review, flags: budgetOwner.callRecipe.requiredInputs },
      feed: { outcome: feedOwner.outcome, version: feedOwner.version, review: feedOwner.review, flags: feedOwner.callRecipe.requiredInputs },
      unknown: unknownOwner.reason,
      versionNotApproved: versionOwner.reason,
    },
    refusals,
    pin: {},
    npm: {},
  };

  const pinConsumer = join(workspace, "pin-consumer");
  cpSync(FIXTURE, pinConsumer, { recursive: true });
  const pinSetup = Date.now();
  installSibling(pinConsumer);
  const pinSiblingLs = npmLs(pinConsumer, "consumer-sibling");
  const pinBaseUnrelated = fileMap(pinConsumer, UNRELATED);
  const pinNote = noteStdout(pinConsumer);
  const beforeA = workDirs(tmp);
  const acquireA = acquire(scriptA, baseEnv, "pin acquire A");
  if (acquireA.status !== 0) throw new Error(`acquire A status ${acquireA.status}`);
  const kitA = kitFrom(acquireA);
  if (packageVersion(kitA) !== PIN_A.version) throw new Error("pin A version");
  const tarballA = join(dirname(kitA), "useful-jobs-1.4.0.tar.gz");
  if (sha256File(tarballA) !== PIN_A.sha256 || statSync(tarballA).size !== PIN_A.bytes) throw new Error("acquire A tarball");
  const versionA = runTool(kitA, ["bin/useful-jobs.mjs", "version"], "pin A version");
  if (versionA.status !== 0 || !String(versionA.stdout).includes("1.4.0")) throw new Error("pin A version command");
  const pinUseStarted = Date.now();
  const pinUseA = runJobs(kitA, mod.bindCapabilityCall, recipes, join(pinConsumer, "runs"), "A");
  const unknownJob = runTool(kitA, ["bin/useful-jobs.mjs", "run", "no-such-job"], "pin unknown job");
  const unknownText = `${unknownJob.stdout || ""}\n${unknownJob.stderr || ""}`;
  if (unknownJob.status !== 2 || !unknownText.includes("unknown job")) throw new Error("unknown job");
  const pinReviewAMs = Date.now() - pinUseStarted;
  mkdirSync(join(pinConsumer, "kept/feed-a"), { recursive: true });
  copyFileSync(join(pinUseA.feedDir, "agenda.json"), join(pinConsumer, "kept/feed-a/agenda.json"));
  copyFileSync(join(pinUseA.feedDir, "agenda.ics"), join(pinConsumer, "kept/feed-a/agenda.ics"));
  const pinKept = ["kept/feed-a/agenda.json", "kept/feed-a/agenda.ics"];
  const pinKeptHash = fileMap(pinConsumer, pinKept);
  const pinUnrelatedAfterUse = fileMap(pinConsumer, UNRELATED);
  if (sameMap(pinBaseUnrelated, pinUnrelatedAfterUse).length) throw new Error("pin unrelated changed during install");
  copyOutputs({ outputs: [] }, pinUseA.budgetDir, "pin-a");
  copyFileSync(join(pinUseA.feedDir, "agenda.json"), join(evidenceDir, "pin-a/agenda.json"));
  copyFileSync(join(pinUseA.feedDir, "agenda.ics"), join(evidenceDir, "pin-a/agenda.ics"));
  copyFileSync(join(pinUseA.budgetDir, "budget-impact.md"), join(evidenceDir, "pin-a/budget-impact.md"));

  const pinFailStarted = Date.now();
  const http146 = curlStatus(PIN_A.url.replace("1.4.0", "1.4.6"), "http 1.4.6");
  const http999 = curlStatus(PIN_A.url.replace("1.4.0", "9.9.9"), "http 9.9.9");
  const fail146 = curlFail(PIN_A.url.replace("1.4.0", "1.4.6"), "curl -f 1.4.6");
  const fail999 = curlFail(PIN_A.url.replace("1.4.0", "9.9.9"), "curl -f 9.9.9");
  if (http146.http !== "404" || http999.http !== "404") throw new Error(`http ${http146.http} ${http999.http}`);
  if (fail146.status === 0 || fail999.status === 0) throw new Error("curl -f accepted an unknown version");
  const dirsBeforeUnknown = workDirs(tmp);
  const unk146 = acquire(script146, baseEnv, "pin acquire 1.4.6");
  const unk999 = acquire(script999, baseEnv, "pin acquire 9.9.9");
  if (unk146.status === 0 || unk999.status === 0) throw new Error("unknown acquire succeeded");
  assertSameDirs(tmp, dirsBeforeUnknown, "unknown acquire");
  if (packageVersion(kitA) !== PIN_A.version) throw new Error("A version changed after unknown acquire");

  const dirsBeforeBad = workDirs(tmp);
  const bad = acquire(scriptBad, baseEnv, "pin acquire bad sha");
  if (bad.status === 0) throw new Error("bad sha acquire succeeded");
  if (!String(bad.stderr).includes("sha256")) throw new Error("bad sha did not report sha256");
  assertSameDirs(tmp, dirsBeforeBad, "bad sha");

  const truncFile = join(cache, "useful-jobs-1.4.7-truncated.tar.gz");
  writeFileSync(truncFile, readFileSync(hostedB.path).subarray(0, 50 * 1024));
  const originScript = join(workspace, "origin-server.mjs");
  writeFileSync(originScript, `import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const body = readFileSync(process.argv[2]);
const urlPath = process.argv[3];
const server = createServer((req, res) => {
  if (req.url !== urlPath) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": "application/gzip", "content-length": String(body.length) });
  res.end(body);
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(String(server.address().port) + "\\n");
});
`);
  const archivePath = "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz";
  const truncServer = await startOrigin(originScript, truncFile, archivePath);
  const dirsBeforeTrunc = workDirs(tmp);
  const truncRun = acquire(scriptB, localEnv(baseEnv, truncServer.origin), "pin acquire truncated");
  await truncServer.close();
  if (truncRun.status === 0 || !String(truncRun.stderr).includes("size")) {
    throw new Error(`truncated acquire did not fail the size check: ${truncRun.stderr}`);
  }
  assertSameDirs(tmp, dirsBeforeTrunc, "truncated");

  const realTar = runCmd("bash", ["-lc", "command -v tar"], { step: "which tar", show: false }).stdout.trim();
  const wrapperDir = join(workspace, "killer-bin");
  mkdirSync(wrapperDir, { recursive: true });
  const wrapper = join(wrapperDir, "tar");
  writeFileSync(wrapper, `#!/bin/bash
if [[ "$1" == "-xzf" ]]; then
  args=("$@")
  cdir=""
  for ((i=0; i<\${#args[@]}; i++)); do
    if [[ "\${args[$i]}" == "-C" ]]; then cdir="\${args[$((i+1))]}"; fi
  done
  ${realTar} "$@" &
  pid=$!
  for n in $(seq 1 2000); do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid"
      echo "tar finished before kill status $?" >&2
      exit $?
    fi
    if [[ -n "$cdir" ]] && find "$cdir" -type f -print -quit 2>/dev/null | grep -q .; then
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      echo "killed tar pid $pid" >&2
      exit 137
    fi
    sleep 0.001
  done
  kill -9 "$pid" 2>/dev/null || true
  echo "killed tar pid $pid on timeout" >&2
  exit 137
fi
exec ${realTar} "$@"
`);
  chmodSync(wrapper, 0o755);
  const killServer = await startOrigin(originScript, hostedB.path, archivePath);
  const dirsBeforeKill = workDirs(tmp);
  const killEnv = localEnv(baseEnv, killServer.origin);
  killEnv.PATH = `${wrapperDir}:${process.env.PATH}`;
  const killRun = acquire(scriptB, killEnv, "pin acquire killed extract");
  await killServer.close();
  if (killRun.status === 0) throw new Error("killed extract acquire succeeded");
  if (!String(killRun.stderr).includes("killed tar")) throw new Error(`kill injection missed: ${killRun.stderr}`);
  assertSameDirs(tmp, dirsBeforeKill, "killed extract");
  if (packageVersion(kitA) !== PIN_A.version) throw new Error("A missing after injected failures");
  const pinStill = runJobs(kitA, mod.bindCapabilityCall, recipes, join(pinConsumer, "runs-still"), "A");
  if (pinStill.budget.digest !== PACKAGE_DIGEST.budgetA) throw new Error("A digest changed after injected failure");
  const pinFailMs = Date.now() - pinFailStarted;

  const pinAmendStarted = Date.now();
  const acquireB = acquire(scriptB, baseEnv, "pin acquire B");
  if (acquireB.status !== 0) throw new Error(`acquire B status ${acquireB.status}`);
  const kitB = kitFrom(acquireB);
  if (packageVersion(kitB) !== PIN_B.version) throw new Error("pin B version");
  const tarballB = join(dirname(kitB), "useful-jobs-1.4.7.tar.gz");
  if (sha256File(tarballB) !== PIN_B.sha256) throw new Error("acquire B tarball");
  const pinUseB = runJobs(kitB, mod.bindCapabilityCall, recipes, join(pinConsumer, "runs-b"), "B");
  const pinFeedCompare = feedFilesMatch(pinUseA.feedDir, pinUseB.feedDir);
  if (!pinFeedCompare.jsonSame || !pinFeedCompare.icsSame) throw new Error(`pin feed drifted ${JSON.stringify(pinFeedCompare)}`);
  copyFileSync(join(pinUseB.budgetDir, "budget-impact.json"), join(evidenceDir, "pin-b-budget-impact.json"));
  copyFileSync(join(pinUseB.budgetDir, "budget-impact.md"), join(evidenceDir, "pin-b-budget-impact.md"));
  copyFileSync(join(pinUseB.feedDir, "agenda.json"), join(evidenceDir, "pin-b-agenda.json"));
  copyFileSync(join(pinUseB.feedDir, "agenda.ics"), join(evidenceDir, "pin-b-agenda.ics"));
  const removeA = runCmd("rm", ["-rf", dirname(kitA)], { step: "pin remove A", display: `rm -rf ${dirname(kitA)}` });
  if (removeA.status !== 0) throw new Error("rm A failed");
  if (existsSync(kitA)) throw new Error("A still present");
  if (packageVersion(kitB) !== PIN_B.version) throw new Error("B damaged by removing A");
  const pinReviewBMs = Date.now() - pinAmendStarted;
  const removedBParent = dirname(kitB);
  const removeB = runCmd("rm", ["-rf", removedBParent], { step: "pin remove B", display: `rm -rf ${removedBParent}` });
  if (removeB.status !== 0 || existsSync(kitB)) throw new Error("rm B failed");
  const removedInvoke = runCmd(process.execPath, [join(kitB, "bin/useful-jobs.mjs"), "version"], {
    step: "pin invoke removed B",
    display: `node ${join(kitB, "bin/useful-jobs.mjs")} version`,
  });
  if (removedInvoke.status === 0) throw new Error("removed B still ran");
  const pinUnrelatedEnd = fileMap(pinConsumer, UNRELATED.concat(pinKept));
  const pinChanges = sameMap({ ...pinUnrelatedAfterUse, ...pinKeptHash }, pinUnrelatedEnd);
  if (pinChanges.length) throw new Error(`pin unrelated changed ${pinChanges.join(",")}`);
  if (noteStdout(pinConsumer) !== pinNote) throw new Error("pin note stdout changed");
  const pinLsEnd = npmLs(pinConsumer, "consumer-sibling");
  if (pinLsEnd.stdout !== pinSiblingLs.stdout) throw new Error("pin sibling npm ls changed");
  const pinMs = Date.now() - pinSetup;

  measured.pin = {
    install: { status: acquireA.status, kit: kitA, sha256: PIN_A.sha256, versionStatus: versionA.status, ms: acquireA.ms },
    useA: pinUseA.budget,
    feedA: pinUseA.feed,
    unknownJob: unknownJob.status,
    http: { "1.4.6": http146.http, "9.9.9": http999.http },
    curlFail: { "1.4.6": fail146.status, "9.9.9": fail999.status },
    acquireUnknown: { "1.4.6": unk146.status, "9.9.9": unk999.status },
    badSha: bad.status,
    truncated: truncRun.status,
    killedExtract: { status: killRun.status, signal: killRun.signal },
    stillA: pinStill.budget.digest,
    update: { status: acquireB.status, sha256: PIN_B.sha256, ms: acquireB.ms },
    useB: pinUseB.budget,
    feedB: pinUseB.feed,
    feedCompare: pinFeedCompare,
    removeA: removeA.status,
    removeB: removeB.status,
    removedInvoke: { status: removedInvoke.status, error: removedInvoke.error ? removedInvoke.error.message : null },
    unrelatedChanges: pinChanges,
    ms: pinMs,
    reviewMs: pinReviewAMs,
    failureMs: pinFailMs,
    setupMs: pinUseStarted - pinSetup,
    amendmentMs: pinReviewBMs,
    amendmentEdits: 6,
    recoveryCommand: null,
  };

  const npmConsumer = join(workspace, "npm-consumer");
  cpSync(FIXTURE, npmConsumer, { recursive: true });
  const npmSetup = Date.now();
  installSibling(npmConsumer);
  const npmBaseUnrelated = fileMap(npmConsumer, UNRELATED);
  const npmNote = noteStdout(npmConsumer);
  const npmA = npmInstallUrl(npmConsumer, PIN_A.url, "npm install A");
  if (npmA.status !== 0) throw new Error("npm install A failed");
  if (installedVersion(npmConsumer) !== PIN_A.version) throw new Error("npm A version");
  const npmLockA = lockEntry(npmConsumer);
  if (!npmLockA || npmLockA.integrity !== hostedA.integrity || npmLockA.resolved !== PIN_A.url) {
    throw new Error(`npm A integrity ${npmLockA && npmLockA.integrity}`);
  }
  const goodSpec = join(workspace, "npm-spec-a");
  saveSpec(npmConsumer, goodSpec);
  const npmKit = join(npmConsumer, "node_modules/useful-jobs");
  const npmUseStarted = Date.now();
  const npmUseA = runJobs(npmKit, mod.bindCapabilityCall, recipes, join(npmConsumer, "runs"), "A");
  if (npmUseA.budget.digest !== pinUseA.budget.digest) throw new Error("npm A digest differs from pin route");
  mkdirSync(join(npmConsumer, "kept/feed-a"), { recursive: true });
  copyFileSync(join(npmUseA.feedDir, "agenda.json"), join(npmConsumer, "kept/feed-a/agenda.json"));
  copyFileSync(join(npmUseA.feedDir, "agenda.ics"), join(npmConsumer, "kept/feed-a/agenda.ics"));
  const npmKept = ["kept/feed-a/agenda.json", "kept/feed-a/agenda.ics"];
  const npmKeptHash = fileMap(npmConsumer, npmKept);
  const npmReviewAMs = Date.now() - npmUseStarted;
  copyFileSync(join(npmUseA.budgetDir, "budget-impact.json"), join(evidenceDir, "npm-a-budget-impact.json"));
  copyFileSync(join(npmUseA.feedDir, "agenda.json"), join(evidenceDir, "npm-a-agenda.json"));

  const npmFailStarted = Date.now();
  const npm146 = npmInstallUrl(npmConsumer, PIN_A.url.replace("1.4.0", "1.4.6"), "npm install 1.4.6");
  const npm999 = npmInstallUrl(npmConsumer, PIN_A.url.replace("1.4.0", "9.9.9"), "npm install 9.9.9");
  if (npm146.status === 0 || npm999.status === 0) throw new Error("npm unknown version installed");
  if (!specSame(npmConsumer, goodSpec)) throw new Error("npm unknown version changed package spec");
  if (installedVersion(npmConsumer) !== PIN_A.version) throw new Error("npm unknown version replaced A");

  const npmTrunc = npmInstallUrl(npmConsumer, truncFile, "npm install truncated B");
  if (npmTrunc.status === 0) throw new Error("npm truncated install succeeded");
  if (installedVersion(npmConsumer) !== PIN_A.version) throw new Error("truncated npm replaced A");
  if (!specSame(npmConsumer, goodSpec)) restoreSpec(npmConsumer, goodSpec);

  const integritySpec = join(workspace, "npm-spec-bad");
  saveSpec(npmConsumer, integritySpec);
  const badLock = readJson(join(integritySpec, "package-lock.json"));
  badLock.packages["node_modules/useful-jobs"].integrity = BAD_INTEGRITY;
  writeFileSync(join(npmConsumer, "package-lock.json"), `${JSON.stringify(badLock, null, 2)}\n`);
  const npmIntegrity = runCmd("npm", ["ci"], {
    cwd: npmConsumer,
    step: "npm ci bad integrity",
    display: "npm ci",
  });
  if (npmIntegrity.status === 0 || !String(npmIntegrity.stderr).includes("EINTEGRITY")) {
    throw new Error("npm ci did not fail EINTEGRITY");
  }
  const removedByCi = installedVersion(npmConsumer) === null;
  restoreSpec(npmConsumer, goodSpec);
  const recoverStarted = Date.now();
  const npmRecover = runCmd("npm", ["ci"], {
    cwd: npmConsumer,
    step: "npm ci recover A",
    display: "npm ci",
  });
  const npmRecoverMs = Date.now() - recoverStarted;
  if (npmRecover.status !== 0 || installedVersion(npmConsumer) !== PIN_A.version) throw new Error("npm ci recovery failed");
  const npmStill = runJobs(join(npmConsumer, "node_modules/useful-jobs"), mod.bindCapabilityCall, recipes, join(npmConsumer, "runs-still"), "A");
  if (npmStill.budget.digest !== PACKAGE_DIGEST.budgetA) throw new Error("recovered A digest");
  const npmFailMs = Date.now() - npmFailStarted;

  const npmAmendStarted = Date.now();
  const npmB = npmInstallUrl(npmConsumer, PIN_B.url, "npm install B");
  if (npmB.status !== 0) throw new Error("npm install B failed");
  if (installedVersion(npmConsumer) !== PIN_B.version) throw new Error("npm B version");
  const npmLockB = lockEntry(npmConsumer);
  if (!npmLockB || npmLockB.integrity !== hostedB.integrity || npmLockB.resolved !== PIN_B.url) {
    throw new Error("npm B integrity");
  }
  const npmUseB = runJobs(join(npmConsumer, "node_modules/useful-jobs"), mod.bindCapabilityCall, recipes, join(npmConsumer, "runs-b"), "B");
  if (npmUseB.budget.digest !== pinUseB.budget.digest) throw new Error("npm B digest differs from pin route");
  const npmFeedCompare = feedFilesMatch(npmUseA.feedDir, npmUseB.feedDir);
  if (!npmFeedCompare.jsonSame || !npmFeedCompare.icsSame) throw new Error("npm feed drifted");
  copyFileSync(join(npmUseB.budgetDir, "budget-impact.json"), join(evidenceDir, "npm-b-budget-impact.json"));
  copyFileSync(join(npmUseB.budgetDir, "budget-impact.md"), join(evidenceDir, "npm-b-budget-impact.md"));
  const npmUninstall = runCmd("npm", ["uninstall", "useful-jobs"], {
    cwd: npmConsumer,
    step: "npm uninstall",
    display: "npm uninstall useful-jobs",
  });
  if (npmUninstall.status !== 0) throw new Error("npm uninstall failed");
  if (installedVersion(npmConsumer) !== null) throw new Error("npm uninstall left useful-jobs");
  const npmRemoved = runCmd(process.execPath, [join(npmConsumer, "node_modules/useful-jobs/bin/useful-jobs.mjs"), "version"], {
    cwd: npmConsumer,
    step: "npm invoke removed",
    display: "node node_modules/useful-jobs/bin/useful-jobs.mjs version",
  });
  if (npmRemoved.status === 0) throw new Error("removed npm bin still ran");
  const npx = runCmd("npx", ["--no-install", "useful-jobs", "version"], {
    cwd: npmConsumer,
    step: "npx removed",
    display: "npx --no-install useful-jobs version",
    timeout: 60000,
  });
  if (npx.status === 0) throw new Error("npx restored useful-jobs");
  if (installedVersion(npmConsumer) !== null) throw new Error("npx reinstalled useful-jobs");
  const npmUnrelatedEnd = fileMap(npmConsumer, UNRELATED.concat(npmKept));
  const npmChanges = sameMap({ ...npmBaseUnrelated, ...npmKeptHash }, npmUnrelatedEnd);
  if (npmChanges.length) throw new Error(`npm unrelated changed ${npmChanges.join(",")}`);
  if (noteStdout(npmConsumer) !== npmNote) throw new Error("npm note stdout changed");
  const npmLsEnd = npmLs(npmConsumer, "consumer-sibling");
  if (!npmLsEnd.stdout.includes("consumer-sibling@0.0.1")) throw new Error("sibling missing after uninstall");
  const npmReviewBMs = Date.now() - npmAmendStarted;

  measured.npm = {
    install: { status: npmA.status, version: PIN_A.version, integrity: npmLockA.integrity, ms: npmA.ms },
    useA: npmUseA.budget,
    feedA: npmUseA.feed,
    unknown: { "1.4.6": npm146.status, "9.9.9": npm999.status },
    truncated: { status: npmTrunc.status, versionAfter: PIN_A.version },
    integrity: { status: npmIntegrity.status, removedA: removedByCi },
    recovery: { command: "npm ci", status: npmRecover.status, ms: npmRecoverMs, digest: npmStill.budget.digest },
    update: { status: npmB.status, integrity: npmLockB.integrity, ms: npmB.ms },
    useB: npmUseB.budget,
    feedB: npmUseB.feed,
    feedCompare: npmFeedCompare,
    uninstall: npmUninstall.status,
    removedInvoke: { status: npmRemoved.status, error: npmRemoved.error ? npmRemoved.error.message : null },
    npx: { status: npx.status },
    unrelatedChanges: npmChanges,
    siblingLs: npmLsEnd.stdout.trim(),
    reviewMs: npmReviewAMs,
    failureMs: npmFailMs,
    setupMs: npmUseStarted - npmSetup,
    amendmentMs: npmReviewBMs,
    amendmentEdits: 0,
    recoveryEdits: 2,
  };

  const versions = runCmd("npm", ["-v"], { step: "npm -v", show: true });
  measured.identity.npm = String(versions.stdout || "").trim();
  measured.timing = {
    totalMs: Date.now() - started,
    harnessDownloadMs: setupDownloadMs,
    pinSetupMs: measured.pin.setupMs,
    pinReviewMs: measured.pin.reviewMs,
    pinFailureMs: measured.pin.failureMs,
    pinAmendmentMs: measured.pin.amendmentMs,
    pinUpdateMs: acquireB.ms,
    npmSetupMs: measured.npm.setupMs,
    npmReviewMs: measured.npm.reviewMs,
    npmFailureMs: measured.npm.failureMs,
    npmAmendmentMs: measured.npm.amendmentMs,
    npmRecoveryMs: npmRecoverMs,
    npmUpdateMs: npmB.ms,
  };
  measured.verdict = verdict(measured);
  writeFileSync(join(evidenceDir, "run.json"), `${JSON.stringify(measured, null, 2)}\n`);
  writeFileSync(join(SCRIPT_DIR, "RESULT.md"), receipt(measured));
  if (!args.workspace) rmSync(workspace, { recursive: true, force: true });
  process.stdout.write(`${measured.verdict.summary}\n`);
}

function verdict(m) {
  const probeReproduced = m.pin.useA.digest === PROBE_DIGEST.budgetA
    && m.pin.useB.digest === PROBE_DIGEST.budgetB
    && m.pin.feedA.digest === PROBE_DIGEST.feed;
  return {
    ordinaryRouteSuffices: true,
    addedHelper: false,
    probeDigestReproduced: probeReproduced,
    summary: "The ordinary acquire pin change and npm tarball install both complete install, use, update, and remove. No installer was added.",
  };
}

function receipt(m) {
  const shown = new Set([
    "refuse missing",
    "refuse writer-checkout",
    "refuse empty-dir",
    "curl 1.4.0",
    "curl 1.4.7",
    "pin acquire A",
    "pin A version",
    "A vendor-budget-impact",
    "A feed-agenda",
    "pin unknown job",
    "http 1.4.6",
    "http 9.9.9",
    "curl -f 1.4.6",
    "curl -f 9.9.9",
    "pin acquire 1.4.6",
    "pin acquire 9.9.9",
    "pin acquire bad sha",
    "pin acquire truncated",
    "pin acquire killed extract",
    "pin acquire B",
    "B vendor-budget-impact",
    "B feed-agenda",
    "pin remove A",
    "pin remove B",
    "pin invoke removed B",
    "npm install sibling",
    "npm install A",
    "npm install 1.4.6",
    "npm install 9.9.9",
    "npm install truncated B",
    "npm ci bad integrity",
    "npm ci recover A",
    "npm install B",
    "npm uninstall",
    "npm invoke removed",
    "npx removed",
  ]);
  const cmdRows = commands
    .filter((entry) => shown.has(entry.step))
    .map((entry) => `| ${entry.step} | ${entry.status === null ? "spawn-error" : entry.status} | ${entry.ms} |`)
    .join("\n");
  return `# N5-E06 lifecycle receipt

Synthetic owner-run consumer. Not a customer, not demand, and not a live quote. vendor-budget-impact output is a supplied-row diff. It is not a bill, a live quote, or purchase authority.

## Bases

| Item | Value |
| --- | --- |
| Declared writer base | \`${DECLARED_BASE}\` |
| Declared writer tree | \`${DECLARED_TREE}\` |
| Actual writer checkout at the run | \`${m.identity.writerCommit}\` |
| Actual writer tree at the run | \`${m.identity.writerTree}\` |
| Writer branch | \`${m.identity.writerBranch}\` |
| Input commit | \`${m.identity.inputCommit}\` |
| Input tree | \`${m.identity.inputTree}\` |
| EMBED commit | \`${EMBED_COMMIT}\` |
| Release history merged into the writer branch | ${m.identity.releaseHistoryMerged} |

The writer branch starts at main. The input commit is a detached worktree passed with \`--source-root\`. EMBED ${EMBED_COMMIT} is an ancestor of that input. The input commit is not an ancestor of the writer checkout.

Repeat, without merging that commit into this branch:

\`\`\`
git fetch origin ${INPUT_COMMIT}
git worktree add --detach <dir> ${INPUT_COMMIT}
node experiments/n5-e06-lifecycle/run.mjs --source-root <dir>
\`\`\`

Admitted blobs, checked with \`git ls-tree\` and \`git hash-object\` before import:

| Path | Blob |
| --- | --- |
| server/lib/observatory/maintained-capability.js | \`${ADMITTED["server/lib/observatory/maintained-capability.js"]}\` |
| server/scripts/test-capability-owner-lookup.js | \`${ADMITTED["server/scripts/test-capability-owner-lookup.js"]}\` |
| client/public/discovery/useful-jobs.json | \`${ADMITTED["client/public/discovery/useful-jobs.json"]}\` |
| client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz | \`${ADMITTED["client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"]}\` |

## Archive hashes

Hosted bytes were downloaded and hashed before any extract this driver controls. The acquire function checks size and sha256 again before it extracts.

| Pin | Bytes | sha256 | npm integrity |
| --- | --- | --- | --- |
| A 1.4.0 | ${m.archives.A.size} | \`${m.archives.A.sha256}\` | \`${m.archives.A.integrity}\` |
| B 1.4.7 | ${m.archives.B.size} | \`${m.archives.B.sha256}\` | \`${m.archives.B.integrity}\` |

## Commands and exits

Node ${m.identity.node}. npm ${m.identity.npm}. Full transcripts: \`evidence/commands.jsonl\`. Substituted acquire scripts: \`evidence/scripts/\`.

| Step | Exit | ms |
| --- | --- | --- |
${cmdRows}

Wrong or missing source roots (missing path, this writer checkout, empty directory) exited 2 with \`source-root-refused\` and created no evidence or workspace files.

## Normal output

Kit-relative labeled samples \`samples/pricing/caller-alpha/\` and \`samples/feed/caller-alpha/\`. EMBED named useful-jobs ${m.embed.budget.version}, review ${m.embed.budget.review} for vendor-budget-impact and ${m.embed.feed.review} for feed-agenda, flags \`--before --after\`. A discovery document whose version is 1.4.0 is \`version_not_approved\`. \`no-such-job\` is \`unknown_need\`. The call used \`bindCapabilityCall\` plus optional \`--out-dir\`.

| Run | vendor-budget-impact digest | feed-agenda digest | feed events |
| --- | --- | --- | --- |
| Pin A | \`${m.pin.useA.digest}\` | \`${m.pin.feedA.digest}\` | ${m.pin.feedA.events} |
| Pin B | \`${m.pin.useB.digest}\` | \`${m.pin.feedB.digest}\` | ${m.pin.feedB.events} |
| npm A | \`${m.npm.useA.digest}\` | \`${m.npm.feedA.digest}\` | ${m.npm.feedA.events} |
| npm B | \`${m.npm.useB.digest}\` | \`${m.npm.feedB.digest}\` | ${m.npm.feedB.events} |

A summary: ${m.pin.useA.summary}. The A action has no beforeValue and no delta. B action: before 1.25, after 1.75, delta 0.5, unit USD/1M-tokens, scope billCalculation false, liveQuote false. Feed JSON matches across A and B except \`generatedAt\`. Feed ICS matches except a possible \`DTSTAMP\` difference. Saved feed files in the consumer \`kept/\` directory stayed byte-identical through update and remove.

Unknown job at A exited ${m.pin.unknownJob}.

## Cost against the baseline

Both routes are baselines. No third helper was added.

| Cost | Pin change | npm |
| --- | --- | --- |
| Harness download and hash, once | ${m.timing.harnessDownloadMs} | ${m.timing.harnessDownloadMs} |
| Setup wall ms, after that download | ${m.timing.pinSetupMs} | ${m.timing.npmSetupMs} |
| Review wall ms (first use of both jobs) | ${m.timing.pinReviewMs} | ${m.timing.npmReviewMs} |
| Amendment wall ms (update, second review, remove) | ${m.timing.pinAmendmentMs} | ${m.timing.npmAmendmentMs} |
| Of which the B install | ${m.timing.pinUpdateMs} | ${m.timing.npmUpdateMs} |
| Failure-injection wall ms | ${m.timing.pinFailureMs} | ${m.timing.npmFailureMs} |
| Recovery wall ms | 0 | ${m.timing.npmRecoveryMs} |
| Hand edits of pin constants | ${m.pin.amendmentEdits} | ${m.npm.amendmentEdits} |
| Recovery file restores | 0 | ${m.npm.recoveryEdits} |

Pin setup is: copy the fixture, \`npm install\` the sibling, substitute bytes, sha256, and version in the documented acquire function (3 edits), run it. Pin amendment is those 3 edits again for 1.4.7, run it, \`rm -rf\` the old root, then \`rm -rf\` the 1.4.7 root. npm setup is \`npm install\` then \`npm install <A url>\`. npm amendment is \`npm install <B url>\` and \`npm uninstall useful-jobs\`. npm writes package.json and the lockfile; the person does not hand-edit hashes on that route.

Review is the two job commands and the digest comparison. Total driver wall ms: ${m.timing.totalMs}.

## Falsifier outcome

1. Install A from the hosted URL produced runnable useful-jobs 1.4.0. The labeled sample is actionable. Package digest \`${m.pin.useA.digest}\`. The pre-dispatch probe hex \`${PROBE_DIGEST.budgetA}\` was not reproduced.
2. After update to B, package digest \`${m.pin.useB.digest}\` with delta 0.5 USD/1M-tokens. Feed-agenda stayed digest \`${m.pin.feedA.digest}\` with 2 events on both pins and both routes. The pre-dispatch probe hex \`${PROBE_DIGEST.budgetB}\` / \`${PROBE_DIGEST.feed}\` was not reproduced.
3. After removing the installation, the removed path exited non-zero (pin status ${m.pin.removedInvoke.status}, npm status ${m.npm.removedInvoke.status}). \`npx --no-install useful-jobs version\` exited ${m.npm.npx.status} and did not recreate \`node_modules/useful-jobs\`. Versions 1.4.6 and 9.9.9 returned HTTP 404 and non-zero acquire/npm status. Unrelated consumer files, the sibling dependency, and the saved feed output did not change.
4. A wrong sha256, a truncated B body, and a tar process killed mid-extract all returned non-zero, left no new work directory, and left A runnable at digest \`${m.pin.stillA}\`. npm install of a truncated B archive exited ${m.npm.truncated.status} and left 1.4.0 in place. \`npm ci\` with a wrong integrity exited ${m.npm.integrity.status} and removed A (${m.npm.integrity.removedA}). Recovery was \`npm ci\` from the saved A lockfile, exit ${m.npm.recovery.status}, ${m.npm.recovery.ms} ms, digest \`${m.npm.recovery.digest}\`.

${m.verdict.summary} Probe digest reproduced: ${m.verdict.probeDigestReproduced}.

## Limits

- The package digest hashes caller path strings. These runs passed kit-relative sample paths, so the digest is stable for that invocation and differs from the pre-dispatch probe hex.
- Hosted immutability here means the caller checked sha256. This run did not rebuild either archive from source commit 27f0730604adf236e0f3ad818a30b5f43be6e656.
- EMBED derives flags by reading the input tree's copy of the 1.4.7 archive. That copy matched the hosted sha256. Successful installs downloaded the hosted URLs. The truncated body and the killed extract used a separate local origin process serving those already verified bytes, with \`USEFUL_JOBS_ORIGIN\` set only for those two acquires.
- The consumer is synthetic and owner-run. No adoption or effort-avoided claim beyond the timings above.
- \`npm ci\` deletes \`node_modules\` before the integrity check, so a bad update lock needs the saved lockfile restored and \`npm ci\` again.
- \`npx --no-install\` queried the public npm registry and was refused. It did not download the hosted archive.
- No deploy, no package publish, no change to hosted archives or discovery JSON.
`;
}

main().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  if (evidenceDir) {
    writeFileSync(join(evidenceDir, "error.txt"), `${message}\n`);
    writeFileSync(join(evidenceDir, "commands-on-error.json"), `${JSON.stringify(commands, null, 2)}\n`);
  }
  process.exit(1);
});
