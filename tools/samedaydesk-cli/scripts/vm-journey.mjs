#!/usr/bin/env node
// One coherent installed journey for the Root VM run. From a checkout of this
// branch it: packs the CLI, installs the archive into an empty offline prefix
// (cold install, no registry), then drives only the INSTALLED binary through
//   1. version, commands, capabilities-free discovery (offline)
//   2. the first credential-free task: readiness check (live free GET)
//   3. a batch of public reads (live free GETs)
//   4. the configured-tenant journey against the inert authority port in
//      test/gateway-authority.mjs: server quote, execute, verified result,
//      a lost committed response recovered by resume in a fresh process
//      (checked against the authority commit count), a tenant batch read
//      of receipts, and the paid-route handoff refusal
//   5. the coverage map
// and prints one JSONL record per step plus a summary. Live steps make only
// free unauthenticated GETs to the configured origin; --no-live skips them.
// The authority is a contract port with no provider and no money: it shows
// client behavior and never proves live funded execution. The real
// MachineGateway check (test/gateway-real.test.mjs) runs when ajv resolves
// from server/vendor/machine-gateway (after `npm ci` there); otherwise it is
// reported as skipped.
// Usage: node scripts/vm-journey.mjs [--no-live] [--origin https://samedaydesk.com] [--keep]
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAuthority, TOKEN_A } from "../test/gateway-authority.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const live = !argv.includes("--no-live");
const keep = argv.includes("--keep");
const origin = argv.includes("--origin") ? argv[argv.indexOf("--origin") + 1] : "https://samedaydesk.com";
const work = mkdtempSync(join(tmpdir(), "sds-vm-journey-"));
const steps = [];

const run = (file, args, { stdin = null, cwd = work, timeout = 120000 } = {}) => new Promise(done => {
  const child = execFile(file, args, { cwd, timeout, maxBuffer: 64 << 20, env: { ...process.env, npm_config_update_notifier: "false" } }, (error, stdout, stderr) =>
    done({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr }));
  if (stdin !== null) child.stdin.end(stdin); else child.stdin.end();
});
const jsonl = text => text.split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { unparsed: line }; } });
function record(step, ok, detail) { const entry = { schema: "samedaydesk.cli.vm-journey.v1", step, ok, ...detail }; steps.push(entry); process.stdout.write(`${JSON.stringify(entry)}\n`); return ok; }
function check(step, condition, detail) { return record(step, !!condition, detail); }

let bin;
const sds = (args, options) => run(process.execPath, [bin, ...args], options);

try {
  // 0. Pack and cold offline install.
  const out = join(work, "out");
  const packed = await run(process.execPath, [join(root, "scripts/pack.mjs"), "--out", out], { cwd: root });
  const archive = jsonl(packed.stdout).at(-1);
  if (!check("pack", packed.code === 0, { exit: packed.code, tarball: archive?.tarball ?? null, tarballSha256: archive?.tarballSha256 ?? null, stderr: packed.code ? packed.stderr.slice(-2000) : undefined })) throw new Error("pack failed");
  const tgz = archive.tarball;
  const prefix = join(work, "prefix"); const cache = join(work, "empty-cache");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const installed = await run(npm, ["install", "--global", "--offline", "--prefix", prefix, "--cache", cache, "--ignore-scripts", "--no-audit", "--no-fund", tgz]);
  bin = join(prefix, "lib/node_modules/@samedaydesk/cli/bin/samedaydesk.mjs");
  if (!check("cold_install_offline", installed.code === 0, { exit: installed.code, prefix, stderr: installed.code ? installed.stderr.slice(-2000) : undefined })) throw new Error("install failed");

  // 1. Offline discovery from the installed bin.
  const version = jsonl((await sds(["version"])).stdout)[0];
  check("installed_version", version?.ok === true, { version: version?.result ?? null });
  const commands = jsonl((await sds(["commands"])).stdout)[0];
  check("installed_commands", commands?.ok === true, { count: commands?.result?.commands?.length ?? null });

  // 2 and 3. Credential-free live reads.
  if (live) {
    const ready = await sds(["readiness", "check", "--host", "example.com", "--origin", origin, "--out", join(work, "readiness.json")]);
    const readyOut = jsonl(ready.stdout)[0];
    check("first_credential_free_task", ready.code === 0, { exit: ready.code, command: "readiness check --host example.com", grade: readyOut?.result?.grade ?? readyOut?.result?.report?.grade ?? null, error: readyOut?.error?.code });
    const items = [
      { id: "health", op: "gateway.health" }, { id: "routes", op: "gateway.routes" }, { id: "profile", op: "market.profile" },
      { id: "apex", op: "apex.health" }, { id: "ready", op: "readiness.check", args: { host: "example.com" } }, { id: "ai", op: "tools.ai_readiness", args: { url: "https://example.com" } },
    ].map(item => JSON.stringify(item)).join("\n");
    const batch = await sds(["batch", "run", "--input-file", "-", "--state-dir", join(work, "batch-live"), "--concurrency", "2", "--origin", origin], { stdin: `${items}\n` });
    const summary = jsonl(batch.stdout).find(entry => entry.type === "summary");
    check("batch_public_reads", batch.code === 0 || batch.code === 12, { exit: batch.code, counts: summary?.counts ?? null, failed: jsonl(batch.stdout).filter(entry => entry.type === "item" && entry.status !== "ok").map(entry => ({ id: entry.id, code: entry.error?.code })) });
  } else {
    record("first_credential_free_task", true, { skipped: "--no-live" });
    record("batch_public_reads", true, { skipped: "--no-live" });
  }

  // 4. Configured-tenant journey against the inert authority port.
  const authority = await startAuthority();
  try {
    const loop = ["--origin", authority.origin, "--allow-loopback"];
    const credential = join(work, "tenant.credential"); writeFileSync(credential, `${TOKEN_A}\n`); chmodSync(credential, 0o600);
    const input = join(work, "input.json"); writeFileSync(input, JSON.stringify({ value: "vm-journey" }));
    const auth = ["--credential-file", credential];
    const leak = text => text.includes(TOKEN_A);
    const quote = await sds(["gateway", "quote", "--route", "fixture.echo", "--input-file", input, ...auth, ...loop]);
    const quoteOut = jsonl(quote.stdout)[0];
    check("tenant_quote", quote.code === 0 && quoteOut?.result?.anonymous === false, { exit: quote.code, kind: quoteOut?.result?.kind, executable: quoteOut?.result?.quote?.executable ?? null });
    const state = join(work, "tenant-state.json");
    const execute = await sds(["gateway", "execute", "--route", "fixture.echo", "--input-file", input, "--state-file", state, ...auth, ...loop]);
    const executeOut = jsonl(execute.stdout)[0];
    check("tenant_execute", execute.code === 0 && authority.control.commits === 1, { exit: execute.code, receiptStatus: executeOut?.result?.receipt?.status ?? null, commits: authority.control.commits, stateMode: (statSync(state).mode & 0o777).toString(8) });
    const result = await sds(["gateway", "result", "--state-file", state, ...auth, ...loop]);
    check("tenant_result_acceptance", result.code === 0 && authority.control.commits === 1, { exit: result.code, receiptStatus: jsonl(result.stdout)[0]?.result?.receipt?.status ?? null, handback: JSON.parse(readFileSync(`${state}.handback.json`, "utf8")).state });
    const lostState = join(work, "lost-state.json");
    authority.control.loseNextExecuteResponse = true;
    const lost = await sds(["gateway", "execute", "--route", "fixture.echo", "--input-file", input, "--state-file", lostState, ...auth, ...loop]);
    const lostOut = jsonl(lost.stdout)[0];
    const committed = authority.control.commits;
    const resumed = await sds(["gateway", "resume", "--state-file", lostState, ...auth, ...loop]);
    check("tenant_lost_response_recovery", lost.code !== 0 && lostOut?.error?.evidence?.recovery === "sent_unconfirmed" && resumed.code === 0 && authority.control.commits === committed && committed === 2, {
      lostExit: lost.code, lostCode: lostOut?.error?.code, commitsAfterLoss: committed, resumeExit: resumed.code, commitsAfterResume: authority.control.commits,
      receiptStatus: jsonl(resumed.stdout)[0]?.result?.receipt?.status ?? null, note: "resume in a fresh process; the server commit count did not grow" });
    const receipts = [readState(state), readState(lostState)].map(entry => entry.receipt?.id ?? entry.receipt?.receiptId).filter(Boolean);
    const items = [...receipts.map((id, index) => ({ id: `r${index}`, op: "gateway.receipt", args: { id } })), { id: "missing", op: "gateway.receipt", args: { id: "00000000-0000-4000-8000-000000000000" } }];
    const batch = await sds(["batch", "run", "--input-file", "-", "--state-dir", join(work, "batch-tenant"), ...auth, ...loop], { stdin: `${items.map(item => JSON.stringify(item)).join("\n")}\n` });
    const summary = jsonl(batch.stdout).find(entry => entry.type === "summary");
    check("tenant_batch_receipts", batch.code === 12 && summary?.counts?.ok === receipts.length, { exit: batch.code, counts: summary?.counts ?? null, expected: "partial (12): stored receipts ok, unknown receipt typed failure" });
    const paid = await sds(["gateway", "execute", "--route", "fixture.paid", "--input-file", input, "--state-file", join(work, "paid-state.json"), ...auth, ...loop]);
    check("paid_route_handoff", paid.code !== 0 && jsonl(paid.stdout)[0]?.error?.code === "paid_route_requires_payment_authority" && authority.control.commits === 2, { exit: paid.code, code: jsonl(paid.stdout)[0]?.error?.code });
    check("no_credential_in_output", ![quote, execute, result, lost, resumed, batch, paid].some(entry => leak(entry.stdout) || leak(entry.stderr)), {});
  } finally { await authority.close(); }

  // Real MachineGateway contract check, when its dependencies are present.
  let ajv = false;
  try { createRequire(join(root, "../../server/vendor/machine-gateway/package.json")).resolve("ajv"); ajv = true; } catch {}
  if (ajv) {
    const real = await run(process.execPath, ["--test", "test/gateway-real.test.mjs"], { cwd: root, timeout: 300000 });
    check("real_gateway_contract", real.code === 0 && !/# skipped [1-9]/.test(real.stdout), { exit: real.code, tail: real.stdout.split("\n").filter(line => /^# (pass|fail|skipped)/.test(line)) });
  } else record("real_gateway_contract", true, { skipped: "ajv not resolvable from server/vendor/machine-gateway; run npm ci there to include it" });

  // 5. Coverage map.
  const coverage = jsonl((await sds(["coverage"])).stdout)[0]?.result;
  check("coverage_map", coverage?.schema === "samedaydesk.cli.coverage.v1", { normalUserActions: coverage?.normalUserActions, counts: coverage?.counts, gaps: coverage?.entries?.filter(entry => entry.audience === "normal_user" && (entry.classification === "gap" || entry.classification === "unsupported")).map(entry => entry.id) });
} catch (error) {
  record("aborted", false, { message: error.message });
} finally {
  const failed = steps.filter(step => !step.ok).map(step => step.step);
  process.stdout.write(`${JSON.stringify({ schema: "samedaydesk.cli.vm-journey.v1", type: "summary", ok: failed.length === 0, steps: steps.length, failed, live, work: keep ? work : null,
    fixtureNote: "Tenant steps ran against an inert contract port; they prove client behavior, not live funded execution." })}\n`);
  if (!keep) rmSync(work, { recursive: true, force: true });
  process.exitCode = steps.some(step => !step.ok) ? 1 : 0;
}

function readState(file) { return JSON.parse(readFileSync(file, "utf8")); }
