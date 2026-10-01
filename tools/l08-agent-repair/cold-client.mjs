// Cold client for the owned repair listener.
// It speaks HTTP, writes the handoff file, and does not start a second writer.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContractRepairHandoff,
  CONTRACT_CALLERS,
  FIXTURE_DIR,
  loadFixture,
  MAX_BYTES,
  prepareOutDir,
  repairContract,
  runRequestFile,
} from "./lib/contract-repair.mjs";
import { ORDINARY_CALLERS, scoreProductPaths, validateMaintHandoff } from "./lib/handoff.mjs";
import { evaluateJourneyRequest, loadSellerRepairBriefs, observeSellerRepairJourney, seededJourneyRejections } from "./lib/journey.mjs";
import { retestOrigin, runTaskReadiness, runTaskReadinessNegative, sayReceipt, writeReceipt } from "./lib/task-readiness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const defaultOut = join(here, "MAINT-HANDOFF.json");
const scoredFixture = join(here, "fixtures/scored-handoff.json");
const LEAK_TOKENS = ["sk_live_L08CONTRACTSECRET", "buyer@example.test", "UNIQUEVALUEZZ", "OTHERVALUEZZ", "plink_"];

function say(line) {
  process.stdout.write(`${line}\n`);
}

function usage() {
  say("usage: node tools/l08-agent-repair/cold-client.mjs run --origin http://127.0.0.1:PORT [--out file] | reject-unchanged --origin http://127.0.0.1:PORT | reject-scored | seller-repair | journey [--finding id] [--wallet create] [--echo-header] [--disposable-only] | journey-negative | contract-repair --in file --out dir | contract-repair-limits | contract-repair-negative | task-readiness | task-readiness-negative | task-readiness-retest --origin http://127.0.0.1:PORT");
}

function loopbackOrigin(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  if (url.hostname !== "127.0.0.1") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, origin: null, out: null, in: null, finding: null, wallet: null, echoHeader: false, disposableOnly: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--origin") {
      opts.origin = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--out") {
      opts.out = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--in") {
      opts.in = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--finding") {
      opts.finding = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--wallet") {
      opts.wallet = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--echo-header") {
      opts.echoHeader = true;
    } else if (arg === "--disposable-only") {
      opts.disposableOnly = true;
    } else {
      return { error: `unknown argument ${arg}` };
    }
  }
  return opts;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function diagnose(origin) {
  const diagnosis = await postJson(`${origin}/v1/diagnose`, {});
  if (scoreProductPaths(diagnosis.json).length) {
    say("cold-client POST /v1/diagnose exit 1 score_product");
    return { exit: 1 };
  }
  if (diagnosis.status !== 200 || diagnosis.json?.finding?.id !== "mcp.unknownTool" || diagnosis.json?.finding?.status !== "fail") {
    say(`cold-client POST /v1/diagnose exit 2 http ${diagnosis.status} finding ${diagnosis.json?.finding?.status ?? "absent"}`);
    return { exit: 2 };
  }
  say("cold-client POST /v1/diagnose exit 0 finding mcp.unknownTool status fail");
  return { exit: 0 };
}

function directoryText(dir) {
  return readdirSync(dir).map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
}

function leaked(text) {
  return LEAK_TOKENS.some((token) => text.includes(token));
}

function runIndependentContractCallers() {
  const section = buildContractRepairHandoff();
  for (const caller of CONTRACT_CALLERS) {
    const out = prepareOutDir();
    const child = spawnSync(process.execPath, [
      fileURLToPath(import.meta.url),
      "contract-repair",
      "--in",
      join(FIXTURE_DIR, caller.file),
      "--out",
      out,
    ], { cwd: repoRoot, encoding: "utf8" });
    if (child.stdout) process.stdout.write(child.stdout.endsWith("\n") || child.stdout === "" ? child.stdout : `${child.stdout}\n`);
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.status !== 0) return { exit: child.status ?? 1 };
    const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"));
    const expected = section.callers.find((item) => item.callerId === caller.callerId);
    const produced = directoryText(out);
    if (JSON.stringify(summary) !== JSON.stringify(expected) || leaked(produced) || leaked(child.stdout || "")) {
      say(`cold-client contract-repair ${caller.callerId} output mismatch`);
      return { exit: 1 };
    }
    if (summary.ownerApplied !== false || summary.verifiedRepair !== false || summary.disposition !== "suggestion") {
      say(`cold-client contract-repair ${caller.callerId} looked verified`);
      return { exit: 1 };
    }
    const regression = JSON.parse(readFileSync(join(out, "regression-result.json"), "utf8"));
    if (regression.exit !== 0 || regression.ownerApplied !== false || regression.verifiedRepair !== false) {
      say(`cold-client contract-repair ${caller.callerId} regression ${regression.exit}`);
      return { exit: 1 };
    }
  }
  if (section.callers[0].routeClass !== "paid_get" || section.callers[0].findingClass !== "missing_response_schema") return { exit: 1 };
  if (section.callers[1].routeClass !== "paid_post" || section.callers[1].findingClass !== "incorrect_response_schema") return { exit: 1 };
  if (section.callers[0].shape !== "object" || section.callers[1].shape !== "array") return { exit: 1 };
  say("cold-client contract-repair two callers suggestion not-owner-applied");
  return { exit: 0, section };
}

export function runContractRepairLimits() {
  const cases = [
    ["incomplete-one.json", "Only one success body"],
    ["conflict-types.json", "Which type does every successful response use?"],
    ["null-mixed.json", "Is null its own success branch?"],
    ["branches.json", "Which branch was not supplied?"],
    ["empty-array.json", "arrays with no items"],
    ["empty-object.json", "objects with no fields"],
    ["one-of.json", "oneOf"],
    ["remote-ref.json", "non-local $ref"],
  ];
  let ok = true;
  for (const [file, needle] of cases) {
    const result = repairContract(loadFixture(file));
    const good = result.exit === 0 && result.kind === "unresolved" && result.summary == null && result.question?.includes(needle);
    say(`contract-repair limit ${file} ${good ? "unresolved" : "failed"}`);
    if (!good) ok = false;
  }
  const empty = repairContract(loadFixture("null-pair.json"));
  const emptyGood = empty.exit === 0
    && empty.summary?.shape === "null"
    && empty.summary?.patch?.schema?.type === "null"
    && empty.summary?.ownerApplied === false
    && empty.summary?.verifiedRepair === false
    && empty.summary?.regression?.exit === 0;
  say(`contract-repair limit null-pair.json ${emptyGood ? "suggestion type null" : "failed"}`);
  return ok && emptyGood ? 0 : 1;
}

export function runContractRepairNegative() {
  const expected = [
    ["unchanged.json", 1, "repair_unchanged"],
    ["unchanged-submitted.json", 1, "repair_unchanged"],
    ["incorrect-submitted.json", 1, "repair_incorrect"],
    ["wallet.json", 1, "second_wallet_refused"],
    ["checkout.json", 1, "checkout_refused"],
    ["method-mismatch.json", 2, "malformed_input"],
  ];
  let ok = true;
  for (const [file, exitCode, error] of expected) {
    const result = repairContract(loadFixture(file));
    const good = result.exit === exitCode && result.error === error && result.summary == null;
    say(`contract-repair negative ${error} exit ${good ? exitCode : result.exit}`);
    if (!good) ok = false;
  }
  const forced = repairContract({
    ...loadFixture("conflict-types.json"),
    callerId: "local-forced-shape",
    submittedRepair: { schema: { type: "object" } },
  });
  const forcedGood = forced.exit === 1 && forced.error === "repair_incorrect" && forced.summary == null;
  say(`contract-repair negative repair_incorrect exit ${forcedGood ? 1 : forced.exit}`);
  if (!forcedGood) ok = false;
  const closed = repairContract({
    callerId: "local-closed-submitted",
    routeClass: "paid_get",
    method: "GET",
    path: "/local/desk/closed",
    contract: { kind: "json-schema", schema: { type: "object" } },
    submittedRepair: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { symbol: { type: "string" } },
        required: ["symbol"],
      },
    },
    observations: [{ symbol: "a", price: 1 }, { symbol: "b", price: 2 }],
  });
  const closedGood = closed.exit === 1 && closed.error === "repair_incorrect";
  say(`contract-repair negative closed_schema exit ${closedGood ? 1 : closed.exit}`);
  if (!closedGood) ok = false;
  let deep = { leaf: 1 };
  for (let index = 0; index < 20; index += 1) deep = { nest: deep };
  const deepResult = repairContract({
    callerId: "local-deep",
    routeClass: "paid_get",
    method: "GET",
    path: "/local/desk/deep",
    contract: { kind: "json-schema" },
    observations: [deep, structuredClone(deep)],
  });
  const wide = {};
  for (let index = 0; index < 40; index += 1) wide[`k${index}`] = 1;
  const wideResult = repairContract({
    callerId: "local-wide",
    routeClass: "paid_get",
    method: "GET",
    path: "/local/desk/wide",
    contract: { kind: "json-schema" },
    observations: [wide, { ...wide }],
  });
  const longResult = repairContract({
    callerId: "local-long",
    routeClass: "paid_post",
    method: "POST",
    path: "/local/desk/long",
    contract: { kind: "json-schema" },
    observations: [{ note: "x".repeat(5000) }, { note: "y" }],
  });
  const shapeGood = deepResult.error === "oversized_input" && wideResult.error === "oversized_input" && longResult.error === "oversized_input";
  say(`contract-repair negative oversized_input exit ${shapeGood ? 2 : 0}`);
  if (!shapeGood) ok = false;
  const malformedOut = prepareOutDir();
  const malformed = runRequestFile(join(FIXTURE_DIR, "malformed.json"), malformedOut);
  const oversizedPath = join(tmpdir(), `l08-oversized-${process.pid}.json`);
  writeFileSync(oversizedPath, `{"pad":"${"x".repeat(MAX_BYTES)}"}`);
  const oversizedOut = prepareOutDir();
  const oversized = runRequestFile(oversizedPath, oversizedOut);
  const fileGood = malformed.exit === 2 && malformed.error === "malformed_input" && oversized.exit === 2 && oversized.error === "oversized_input";
  say(`contract-repair negative malformed_input exit ${malformed.exit === 2 ? 2 : malformed.exit}`);
  say(`contract-repair negative file_oversized exit ${oversized.exit === 2 ? 2 : oversized.exit}`);
  if (!fileGood) ok = false;
  const secretOut = prepareOutDir();
  const secret = runRequestFile(join(FIXTURE_DIR, "paid-get-object.json"), secretOut);
  const secretText = `${directoryText(secretOut)}`;
  const secretGood = secret.exit === 0 && !leaked(secretText);
  say(`contract-repair negative secret_redacted exit ${secretGood ? 0 : 2}`);
  if (!secretGood) ok = false;
  const tamperOut = prepareOutDir();
  const tamper = runRequestFile(join(FIXTURE_DIR, "paid-post-array.json"), tamperOut);
  const regressionPath = join(tamperOut, "regression.json");
  const regression = JSON.parse(readFileSync(regressionPath, "utf8"));
  regression.proposedSchema = { type: "object" };
  regression.patch.value = { type: "object" };
  writeFileSync(regressionPath, `${JSON.stringify(regression, null, 2)}\n`);
  const rerun = spawnSync(process.execPath, [join(tamperOut, "regression.mjs")], { encoding: "utf8" });
  const tamperGood = tamper.exit === 0 && rerun.status === 1;
  say(`contract-repair negative tampered_regression exit ${tamperGood ? 1 : rerun.status}`);
  if (!tamperGood) ok = false;
  return ok ? 1 : 2;
}

export async function runColdClient(origin, outPath) {
  const diagnosed = await diagnose(origin);
  if (diagnosed.exit !== 0) return diagnosed.exit;
  const repair = await postJson(`${origin}/v1/repair`, {});
  if (scoreProductPaths(repair.json).length) {
    say("cold-client POST /v1/repair exit 1 score_product");
    return 1;
  }
  if (repair.status !== 200 || repair.json?.applied !== true || repair.json?.mode !== "fixed") {
    say(`cold-client POST /v1/repair exit 1 http ${repair.status} ${repair.json?.error ?? ""}`);
    return 1;
  }
  say("cold-client POST /v1/repair exit 0 mode fixed");
  const regress = await postJson(`${origin}/v1/regress`, {});
  if (scoreProductPaths(regress.json).length) {
    say("cold-client POST /v1/regress exit 1 score_product");
    return 1;
  }
  if (regress.status !== 200) {
    say(`cold-client POST /v1/regress exit 1 http ${regress.status} ${regress.json?.error ?? ""}`);
    return 1;
  }
  const contractRepair = runIndependentContractCallers();
  if (contractRepair.exit !== 0) return contractRepair.exit;
  const enriched = { ...regress.json, contractRepair: contractRepair.section };
  const verdict = validateMaintHandoff(enriched);
  if (!verdict.ok) {
    say(`cold-client POST /v1/regress exit 1 handoff ${verdict.error}`);
    return 1;
  }
  say("cold-client POST /v1/regress exit 0 finding mcp.unknownTool fail -> pass");
  say(`cold-client prior-seal ${enriched.priorSeal}`);
  say(`cold-client continuation ${enriched.continuation.job} operation ${enriched.continuation.operationId}`);
  const callers = enriched.journey?.callers;
  if (!Array.isArray(callers) || callers.length !== 2) {
    say("cold-client journey exit 1 callers absent");
    return 1;
  }
  for (const caller of callers) {
    say(`cold-client journey ${caller.findingId} ${caller.routeClass} maintenance-scope`);
  }
  writeFileSync(outPath, `${JSON.stringify(enriched, null, 2)}\n`);
  const roundTrip = validateMaintHandoff(JSON.parse(readFileSync(outPath, "utf8")));
  if (!roundTrip.ok) {
    say(`cold-client handoff reread ${roundTrip.error}`);
    return 1;
  }
  say(`cold-client handoff ${outPath}`);
  return 0;
}

export async function runColdRejectUnchanged(origin) {
  const diagnosed = await diagnose(origin);
  if (diagnosed.exit !== 0) return diagnosed.exit;
  const regress = await postJson(`${origin}/v1/regress`, {});
  const rejected = regress.status === 409 && regress.json?.error === "finding_unchanged";
  say(`cold-client POST /v1/regress exit ${rejected ? 1 : 2} finding mcp.unknownTool unchanged ${regress.json?.before ?? "?"}`);
  return rejected ? 1 : 2;
}

export function runColdRejectScored() {
  const doc = JSON.parse(readFileSync(scoredFixture, "utf8"));
  const verdict = validateMaintHandoff(doc);
  if (verdict.ok || verdict.error !== "score_product") {
    say(`cold-client handoff rejected ${verdict.ok ? "accepted_scored_document" : verdict.error}`);
    return verdict.ok ? 0 : 2;
  }
  say("cold-client handoff rejected score_product");
  return 1;
}

function sayCaller(caller) {
  const maintenance = caller.maintenance?.requiredContract?.[0];
  if (typeof maintenance !== "string" || maintenance.length === 0) return false;
  say(`journey caller ${caller.findingId} ${caller.routeClass} useful maintenance-scope no-url no-wallet`);
  say(`journey maintenance ${caller.findingId} ${maintenance}`);
  return true;
}

export async function runJourneyArgv(rest) {
  const parsed = parseArgs(["journey", ...rest]);
  if (parsed.error || parsed.origin != null || parsed.out != null) {
    say(parsed.error ? `cold-client ${parsed.error}` : "cold-client journey takes no origin");
    return 2;
  }
  const selective = parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly;
  if (selective) {
    const briefs = loadSellerRepairBriefs();
    const verdict = evaluateJourneyRequest({
      findingId: parsed.finding ?? "",
      wallet: parsed.wallet,
      echoHeader: parsed.echoHeader,
      disposableOnly: parsed.disposableOnly,
    }, briefs);
    if (!verdict.ok) {
      say(`journey negative ${verdict.error} exit 1`);
      return 1;
    }
    if (!ORDINARY_CALLERS.some((pin) => pin.findingId === parsed.finding)) {
      say("journey finding is not one of the two ordinary callers");
      return 2;
    }
  }
  const observed = await observeSellerRepairJourney();
  if (observed.catalogMutated !== false || observed.catalogUntouched !== true) {
    say("journey catalog-mutated");
    return 1;
  }
  const selected = selective
    ? observed.callers.filter((caller) => caller.findingId === parsed.finding)
    : observed.callers;
  if (selected.length !== (selective ? 1 : ORDINARY_CALLERS.length)) {
    say("journey caller absent");
    return 1;
  }
  for (const caller of selected) {
    if (!sayCaller(caller) || caller.checkout?.url != null || caller.checkoutUrl != null) {
      say("journey caller missing maintenance");
      return 1;
    }
    if (caller.checkout.sent === true && (caller.checkout.httpStatus !== 503 || caller.checkout.error !== "Payments not configured")) {
      say(`journey caller ${caller.findingId} checkout ${caller.checkout.httpStatus}`);
      return 1;
    }
    if (caller.checkout.sent === false && caller.checkout.withheld !== "stripe_configured") {
      say(`journey caller ${caller.findingId} checkout withheld`);
      return 1;
    }
  }
  say("journey catalog-untouched");
  return 0;
}

export function runJourneyNegative() {
  const seeded = seededJourneyRejections();
  let ok = true;
  for (const row of seeded) {
    say(`journey negative ${row.id} exit ${row.rejected ? 1 : 2}`);
    if (!row.rejected || row.expectsExit !== 1) ok = false;
  }
  return ok ? 1 : 2;
}

export async function runColdSellerRepair() {
  const { observeSellerRepairCold } = await import("./lib/seller-repair-cold.mjs");
  const observed = await observeSellerRepairCold();
  const gateOk = observed.gate === "503-before-allowlist" || observed.gate === "allowlist-reject";
  const catalogOk = observed.catalogMutated === false && observed.catalogUntouched === true && observed.hasUrl === false;
  const ok = gateOk && catalogOk && observed.allowlistRejectsUnknown === true && observed.findingIsSellerBrief === false;
  const catalogWord = observed.catalogMutated ? "catalog-mutated" : "catalog-untouched";
  say(`cold-client seller-repair POST /api/checkout/seller-repair-session finding_id not-a-catalog-id -> ${observed.invalidFindingHttpStatus} gate ${observed.gate} ${catalogWord}`);
  if (observed.gate === "503-before-allowlist") {
    say(`cold-client seller-repair compared finding_id ${observed.comparedFindingId} -> ${observed.comparedFindingHttpStatus} same-gate`);
  }
  return ok ? 0 : 1;
}

const commandLine = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (commandLine) {
  const parsed = parseArgs(process.argv.slice(2));
  let exit = 2;
  try {
    if (parsed.error) {
      say(`cold-client ${parsed.error}`);
      usage();
      exit = 2;
    } else if (parsed.command === "run") {
      const origin = loopbackOrigin(parsed.origin);
      if (!origin) {
        say("cold-client origin must be loopback http://127.0.0.1:PORT");
        exit = 2;
      } else if (parsed.out === "") {
        say("cold-client missing --out path");
        exit = 2;
      } else {
        exit = await runColdClient(origin, parsed.out ? resolve(parsed.out) : defaultOut);
      }
    } else if (parsed.command === "reject-unchanged") {
      const origin = loopbackOrigin(parsed.origin);
      if (!origin || parsed.out != null) {
        say(parsed.out != null ? "cold-client reject-unchanged does not write a handoff" : "cold-client origin must be loopback http://127.0.0.1:PORT");
        exit = 2;
      } else {
        exit = await runColdRejectUnchanged(origin);
      }
    } else if (parsed.command === "reject-scored") {
      if (parsed.origin != null || parsed.out != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client reject-scored takes no origin");
        exit = 2;
      } else {
        exit = runColdRejectScored();
      }
    } else if (parsed.command === "seller-repair") {
      if (parsed.origin != null || parsed.out != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client seller-repair takes no origin");
        exit = 2;
      } else {
        exit = await runColdSellerRepair();
      }
    } else if (parsed.command === "journey") {
      exit = await runJourneyArgv(process.argv.slice(3));
    } else if (parsed.command === "contract-repair") {
      if (parsed.origin != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly || !parsed.in || !parsed.out) {
        say("cold-client contract-repair takes --in file --out dir");
        exit = 2;
      } else {
        const ran = runRequestFile(resolve(parsed.in), resolve(parsed.out));
        if (ran.question) say(`contract-repair unresolved ${ran.question}`);
        else if (ran.exit === 0 && ran.result?.summary) {
          const summary = ran.result.summary;
          say(`contract-repair ${summary.callerId} ${summary.routeClass} ${summary.findingClass} ${summary.shape} suggestion not-owner-applied source ${summary.sourceId}`);
          say(`contract-repair regression prior-mismatch ${summary.regression.reason} proposed-accept decoy-reject exit 0`);
        } else if (ran.exit === 1) say(`contract-repair rejected ${ran.error} exit 1`);
        else say(`contract-repair ${ran.error ?? "failed"} exit ${ran.exit}`);
        exit = ran.exit;
      }
    } else if (parsed.command === "contract-repair-limits") {
      if (parsed.origin != null || parsed.out != null || parsed.in != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client contract-repair-limits takes no arguments");
        exit = 2;
      } else {
        exit = runContractRepairLimits();
      }
    } else if (parsed.command === "contract-repair-negative") {
      if (parsed.origin != null || parsed.out != null || parsed.in != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client contract-repair-negative takes no arguments");
        exit = 2;
      } else {
        exit = runContractRepairNegative();
      }
    } else if (parsed.command === "task-readiness") {
      if (parsed.origin != null || parsed.out != null || parsed.in != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client task-readiness takes no arguments");
        exit = 2;
      } else {
        const receipt = await runTaskReadiness();
        writeReceipt(receipt);
        sayReceipt(receipt, say);
        exit = 0;
      }
    } else if (parsed.command === "task-readiness-negative") {
      if (parsed.origin != null || parsed.out != null || parsed.in != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client task-readiness-negative takes no arguments");
        exit = 2;
      } else {
        const negative = await runTaskReadinessNegative();
        say(`task-readiness negative semantic_not_ready exit ${negative.shaped ? 1 : 2}`);
        say(`task-readiness negative demand_not_from_probe exit ${negative.demandDistinct ? 1 : 2}`);
        say(`task-readiness negative stale_sibling exit ${negative.stale ? 1 : 2}`);
        say(`task-readiness negative pin_mismatch exit ${negative.mismatch ? 1 : 2}`);
        say(`task-readiness negative private_not_availability exit ${negative.privateDistinct ? 1 : 2}`);
        exit = negative.exit;
      }
    } else if (parsed.command === "task-readiness-retest") {
      const origin = loopbackOrigin(parsed.origin);
      if (!origin || parsed.out != null || parsed.in != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client task-readiness-retest takes --origin http://127.0.0.1:PORT");
        exit = 2;
      } else {
        const result = await retestOrigin(origin);
        if (result.exit === 0) {
          say(`task-readiness retest POST /quote repair-complete adapter exit ${result.consumed.status} semantic pass`);
        } else {
          say(`task-readiness retest refused ${result.reason ?? "adapter"}`);
        }
        exit = result.exit;
      }
    } else if (parsed.command === "journey-negative") {
      if (parsed.origin != null || parsed.out != null || parsed.finding != null || parsed.wallet != null || parsed.echoHeader || parsed.disposableOnly) {
        say("cold-client journey-negative takes no arguments");
        exit = 2;
      } else {
        exit = runJourneyNegative();
      }
    } else {
      usage();
      exit = 2;
    }
  } catch (err) {
    say(`cold-client error ${err instanceof Error ? err.message : "failed"}`);
    exit = 2;
  }
  process.exit(exit);
}
