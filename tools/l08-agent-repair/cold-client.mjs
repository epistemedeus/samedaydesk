// Cold client for the owned repair listener.
// It speaks HTTP, writes the handoff file, and does not start a second writer.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreProductPaths, validateMaintHandoff } from "./lib/handoff.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const defaultOut = join(here, "MAINT-HANDOFF.json");
const scoredFixture = join(here, "fixtures/scored-handoff.json");

function say(line) {
  process.stdout.write(`${line}\n`);
}

function usage() {
  say("usage: node tools/l08-agent-repair/cold-client.mjs run --origin http://127.0.0.1:PORT [--out file] | reject-unchanged --origin http://127.0.0.1:PORT | reject-scored | seller-repair");
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
  const opts = { command, origin: null, out: null };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--origin") {
      opts.origin = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--out") {
      opts.out = rest[i + 1] ?? "";
      i += 1;
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
  const verdict = validateMaintHandoff(regress.json);
  if (!verdict.ok) {
    say(`cold-client POST /v1/regress exit 1 handoff ${verdict.error}`);
    return 1;
  }
  say("cold-client POST /v1/regress exit 0 finding mcp.unknownTool fail -> pass");
  say(`cold-client prior-seal ${regress.json.priorSeal}`);
  say(`cold-client continuation ${regress.json.continuation.job} operation ${regress.json.continuation.operationId}`);
  writeFileSync(outPath, `${JSON.stringify(regress.json, null, 2)}\n`);
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
      if (parsed.origin != null || parsed.out != null) {
        say("cold-client reject-scored takes no origin");
        exit = 2;
      } else {
        exit = runColdRejectScored();
      }
    } else if (parsed.command === "seller-repair") {
      if (parsed.origin != null || parsed.out != null) {
        say("cold-client seller-repair takes no origin");
        exit = 2;
      } else {
        exit = await runColdSellerRepair();
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
