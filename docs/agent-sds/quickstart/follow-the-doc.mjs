#!/usr/bin/env node
/**
 * Cold follow-the-doc runner for the SDS agent Diátaxis quickstart.
 * Executes tagged bash fences in tutorial.md and requires seeded refusals.
 * No payment, checkout, registry publish, or live merchant extract.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaptureMeta, sha256File } from "../../../tools/presence/for-agents-cold-read.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const tutorialPath = join(here, "tutorial.md");
const readmePath = join(here, "README.md");
const fixturePath = join(here, "fixtures/seeded-failures.json");

const FENCE_RE =
  /<!--\s*follow-the-doc:(step|seeded-failure)\s+id=([A-Za-z0-9_-]+)\s*-->\s*```(?:bash|sh)?\n([\s\S]*?)```/g;

const REQUIRED_STEPS = [
  "cold-read",
  "fixture-pins",
  "route-page-change",
  "reuse-preview",
];

const FORBIDDEN_FLAGS = new Set([
  "--pay",
  "--payment",
  "--checkout",
  "--publish",
  "--registry",
  "--live",
]);

const FORBIDDEN_FENCE_PATTERNS = [
  { id: "extract-batch", re: /\/extract\/batch/i },
  { id: "pay-flag", re: /(?:^|[\s;])--pay(?:ment)?(?:\s|=|$)/ },
  { id: "checkout-flag", re: /(?:^|[\s;])--checkout(?:\s|=|$)/ },
  { id: "publish-flag", re: /(?:^|[\s;])--publish(?:\s|=|$)/ },
  { id: "registry-flag", re: /(?:^|[\s;])--registry(?:\s|=|$)/ },
  { id: "live-flag", re: /(?:^|[\s;])--live(?:\s|=|$)/ },
  { id: "npm-install", re: /npm\s+install/i },
  { id: "neomorphic", re: /neomorphic\.io/i },
];

const MAX_SPAWN_OUTPUT = 1_048_576;
const SPAWN_KILL_GRACE_MS = 250;

export const LLMS_SHA =
  "95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d";
export const SKILLS_SHA =
  "a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564";

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

function flagName(a) {
  const eq = String(a).indexOf("=");
  return eq === -1 ? a : a.slice(0, eq);
}

export function parseArgs(argv) {
  const out = { json: true, seededFailure: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FORBIDDEN_FLAGS.has(flagName(a))) {
      throw Object.assign(new Error(`forbidden flag: ${a}`), {
        code: "payment-forbidden",
      });
    }
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

export function fenceContractProblems(script) {
  const text = String(script || "");
  return FORBIDDEN_FENCE_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
}

export function readDocs() {
  const tutorial = readFileSync(tutorialPath, "utf8");
  const readme = readFileSync(readmePath, "utf8");
  const tagged = extractTagged(tutorial);
  return { tutorial, readme, ...tagged };
}

function childEnv() {
  const env = { ...process.env };
  delete env.BASH_ENV;
  delete env.ENV;
  delete env.CDPATH;
  return env;
}

function appendCapped(current, chunk) {
  if (current.length >= MAX_SPAWN_OUTPUT) return current;
  const text = chunk.toString("utf8");
  const room = MAX_SPAWN_OUTPUT - current.length;
  return current + (text.length > room ? text.slice(0, room) : text);
}

function killProcessGroup(child) {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // ESRCH if the group is already gone
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // already dead
  }
}

export function spawnBash(script, { timeoutMs = 60000 } = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn("bash", ["-c", script], {
      cwd: repoRoot,
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let graceTimer;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      fn();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child);
      graceTimer = setTimeout(() => {
        finish(() =>
          resolveP({
            status: 124,
            stdout,
            stderr,
            timedOut: true,
          }),
        );
      }, SPAWN_KILL_GRACE_MS);
    }, timeoutMs);
    child.stdout.on("data", (c) => {
      stdout = appendCapped(stdout, c);
    });
    child.stderr.on("data", (c) => {
      stderr = appendCapped(stderr, c);
    });
    child.on("error", (err) => {
      killProcessGroup(child);
      finish(() => reject(err));
    });
    child.on("close", (status) => {
      finish(() =>
        resolveP({
          status: timedOut ? 124 : status ?? 1,
          stdout,
          stderr,
          timedOut,
        }),
      );
    });
  });
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function combined(r) {
  return `${r.stdout || ""}\n${r.stderr || ""}`;
}

export function expectSeededRejected(spec, r, extra = {}) {
  if (r?.timedOut) return false;
  if (!spec?.expect) return r.status !== 0;
  const expect = spec.expect;
  if (expect.exitNonZero && r.status === 0) return false;
  if (typeof expect.exitCode === "number" && r.status !== expect.exitCode) {
    return false;
  }
  if (expect.outputMatches && !new RegExp(expect.outputMatches, "i").test(combined(r))) {
    return false;
  }
  if (expect.outFileMustNotExist && existsSync(expect.outFileMustNotExist)) {
    return false;
  }
  if (expect.json) {
    const body = extra.json ?? parseJsonFromStdout(r.stdout);
    if (!body) return false;
    for (const [k, v] of Object.entries(expect.json)) {
      if (v === null) {
        if (body[k] !== null) return false;
      } else if (body[k] !== v) {
        return false;
      }
    }
  }
  return true;
}

export function pinCheck(docs = readDocs(), fixture = null) {
  const problems = [];
  let parsed = fixture;
  if (!parsed) {
    try {
      parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
    } catch (err) {
      return {
        ok: false,
        problems: [`seeded-failures.json: ${err.message}`],
        fixturePins: [],
      };
    }
  }
  let capture;
  try {
    capture = loadCaptureMeta();
  } catch (err) {
    problems.push(`capture.json: ${err.message}`);
    capture = { freeAlternates: [] };
  }
  const texts = [
    ["tutorial.md", docs.tutorial],
    ["README.md", docs.readme],
  ];

  for (const pin of parsed.fixturePins || []) {
    try {
      const got = sha256File(pin.bodyFile);
      if (got !== pin.sha256) {
        problems.push(`fixture ${pin.bodyFile} sha ${got} != ${pin.sha256}`);
      }
    } catch (err) {
      problems.push(`fixture ${pin.bodyFile}: ${err.message}`);
    }
    const captured = (capture.freeAlternates || []).find((a) => a.id === pin.id);
    if (!captured || captured.sha256 !== pin.sha256) {
      problems.push(`capture.json drift for ${pin.id}`);
    }
    for (const [name, t] of texts) {
      if (!t.includes(pin.sha256)) problems.push(`${name} is missing pin ${pin.id}`);
    }
  }

  const requiredPhrases = [
    ["tutorial.md", docs.tutorial, "preferFixture:true"],
    ["tutorial.md", docs.tutorial, "offline_fixture"],
    ["tutorial.md", docs.tutorial, "complete_issue_acquisition_unavailable"],
    ["tutorial.md", docs.tutorial, "Do not pay"],
    ["tutorial.md", docs.tutorial, "Do not call `/extract/batch`"],
    ["README.md", docs.readme, "Diátaxis"],
    ["README.md", docs.readme, "follow-the-doc.mjs"],
  ];
  for (const [name, t, phrase] of requiredPhrases) {
    if (!t.includes(phrase)) problems.push(`${name} is missing ${JSON.stringify(phrase)}`);
  }

  for (const [name, t] of texts) {
    if (/neomorphic\.io/i.test(t)) {
      problems.push(`${name} must not send agents to neomorphic.io`);
    }
    if (/npm install/i.test(t) && !/no `npm install`/i.test(t) && !/No `npm install`/i.test(t)) {
      problems.push(`${name} must not instruct npm install`);
    }
  }

  for (const id of REQUIRED_STEPS) {
    if (!docs.steps.some((s) => s.id === id)) problems.push(`missing step ${id}`);
  }
  for (const spec of parsed.failures || []) {
    if (!docs.failures.some((s) => s.id === spec.id)) {
      problems.push(`missing seeded fence ${spec.id}`);
    }
  }

  for (const item of [...docs.steps, ...docs.failures]) {
    for (const id of fenceContractProblems(item.script)) {
      problems.push(`fence ${item.id} contains forbidden ${id}`);
    }
  }

  const cold = docs.steps.find((s) => s.id === "cold-read");
  if (cold && !cold.script.includes("preferFixture:true")) {
    problems.push("cold-read fence is missing preferFixture:true");
  }
  const route = docs.steps.find((s) => s.id === "route-page-change");
  if (route && !route.script.includes("page-change-evidence.job.json")) {
    problems.push("route-page-change fence is not the page-change fixture");
  }
  const exportFence = docs.failures.find((s) => s.id === "export-without-opt-in");
  if (exportFence && /(?:^|[\s;])--opt-in(?:\s|=|$)/.test(exportFence.script)) {
    problems.push("export-without-opt-in fence must not pass --opt-in");
  }

  return {
    ok: problems.length === 0,
    problems,
    fixturePins: parsed.fixturePins,
  };
}

function summarizeColdRead(body) {
  return {
    outcome: body?.outcome ?? null,
    paid: body?.paid ?? null,
    liveObserved: body?.liveObserved ?? null,
    coverage: body?.coverage ?? null,
    sourceIds: Array.isArray(body?.sources) ? body.sources.map((s) => s.id) : [],
  };
}

async function runHappy(docs) {
  const byId = Object.fromEntries(docs.steps.map((s) => [s.id, s]));
  const results = {};

  const cold = await spawnBash(byId["cold-read"].script);
  const coldJson = parseJsonFromStdout(cold.stdout);
  results["cold-read"] = {
    exitCode: cold.status,
    ...summarizeColdRead(coldJson),
    ok:
      cold.status === 0 &&
      coldJson?.outcome === "offline_fixture" &&
      coldJson?.paid === false &&
      coldJson?.liveObserved === false &&
      coldJson?.coverage === "partial_discovery_not_apex_guide" &&
      Array.isArray(coldJson?.sources) &&
      coldJson.sources.length === 2,
  };

  const pins = await spawnBash(byId["fixture-pins"].script);
  const pinLines = String(pins.stdout || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const pinSet = new Set(pinLines.map((p) => p.sha256));
  results["fixture-pins"] = {
    exitCode: pins.status,
    ids: pinLines.map((p) => p.id),
    ok:
      pins.status === 0 &&
      pinSet.has(LLMS_SHA) &&
      pinSet.has(SKILLS_SHA) &&
      pinLines.length === 2,
  };

  const route = await spawnBash(byId["route-page-change"].script);
  const routeJson = parseJsonFromStdout(route.stdout);
  results["route-page-change"] = {
    exitCode: route.status,
    offerId: routeJson?.selected?.offerId ?? null,
    paid: routeJson?.paid ?? null,
    paymentRequired: routeJson?.paymentRequired ?? null,
    executionAuthorized: routeJson?.executionAuthorized ?? null,
    ok:
      route.status === 0 &&
      routeJson?.ok === true &&
      routeJson?.selected?.offerId === "sdd.page_change_offline" &&
      routeJson?.paid === false &&
      routeJson?.paymentRequired === false &&
      routeJson?.executionAuthorized === false,
  };

  const preview = await spawnBash(byId["reuse-preview"].script);
  const previewJson = parseJsonFromStdout(preview.stdout);
  results["reuse-preview"] = {
    exitCode: preview.status,
    mode: previewJson?.mode ?? null,
    publicSafeCertified: previewJson?.publicSafeCertified ?? null,
    optInRequiredToWrite: previewJson?.optInRequiredToWrite ?? null,
    ok:
      preview.status === 0 &&
      previewJson?.ok === true &&
      previewJson?.mode === "preview" &&
      previewJson?.publicSafeCertified === false &&
      previewJson?.optInRequiredToWrite === true,
  };

  const ok = REQUIRED_STEPS.every((id) => results[id]?.ok);
  return {
    ok,
    exitCode: ok ? 0 : 1,
    steps: results,
  };
}

async function runOneSeeded(spec, fence) {
  if (spec.expect?.outFileMustNotExist) {
    rmSync(spec.expect.outFileMustNotExist, { force: true });
  }
  const r = await spawnBash(fence.script);
  const json = parseJsonFromStdout(r.stdout);
  const rejected = expectSeededRejected(spec, r, { json });
  const text = combined(r);
  const signalMatch =
    spec.expect?.outputMatches && text.match(new RegExp(spec.expect.outputMatches, "i"));
  return {
    id: spec.id,
    rejected,
    exitCode: r.status,
    signal: signalMatch ? signalMatch[0] : null,
    warnings: json?.warnings ?? null,
    jsonOk: json?.ok ?? null,
    selected: json && "selected" in json ? json.selected : undefined,
    output: text.slice(0, 1600),
  };
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
      surface: "sds-agent-quickstart",
      quadrant: "tutorial",
      paid: false,
      liveMerchantExtract: false,
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
      surface: "sds-agent-quickstart",
      quadrant: "tutorial",
      paid: false,
      liveMerchantExtract: false,
      pins: { fixturePins: pins.fixturePins },
      tutorial: null,
      seededFailures: [],
      problems: unknownWanted.map((id) => `unknown seeded-failure ${id}`),
    };
  }

  const needHappy = !seededFailure || seededFailure === "all";
  let tutorial = null;
  if (needHappy) {
    tutorial = await runHappy(docs);
  }

  const seeded = [];
  for (const spec of fixture.failures) {
    if (!wanted.includes(spec.id)) continue;
    const fence = docs.failures.find((f) => f.id === spec.id);
    if (!fence) {
      seeded.push({ id: spec.id, rejected: false, exitCode: 1, output: "missing tagged fence" });
      continue;
    }
    seeded.push(await runOneSeeded(spec, fence));
  }

  const happyOk = tutorial ? tutorial.ok : true;
  const seededOk =
    seeded.length === wanted.length && seeded.every((s) => s.rejected === true);
  const problems = [];
  if (!happyOk) problems.push("tutorial follow-the-doc did not succeed");
  if (!seededOk) problems.push("a seeded failure was not rejected");

  return {
    ok: happyOk && seededOk && pins.ok,
    surface: "sds-agent-quickstart",
    quadrant: "tutorial",
    paid: false,
    liveMerchantExtract: false,
    checkout: false,
    publish: false,
    pins: { fixturePins: pins.fixturePins },
    tutorial,
    seededFailures: seeded,
    problems,
  };
}

function printHelp() {
  process.stdout.write(`Usage:
  node docs/agent-sds/quickstart/follow-the-doc.mjs
  node docs/agent-sds/quickstart/follow-the-doc.mjs --seeded-failure complete-issue-discussion
  node docs/agent-sds/quickstart/follow-the-doc.mjs --seeded-failure unknown-fixture
  node docs/agent-sds/quickstart/follow-the-doc.mjs --seeded-failure export-without-opt-in

Follows tagged fences in tutorial.md. Requires seeded failures to be refused.
No payment, checkout, publish, or live merchant extract.
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
    const code = err?.code === "payment-forbidden" ? "payment-forbidden" : "runner-error";
    process.stdout.write(
      `${JSON.stringify({ ok: false, code, message: String(err?.message || err) }, null, 2)}\n`,
    );
    process.exit(1);
  }
}
