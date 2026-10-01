#!/usr/bin/env node
// Public cold client for a supplied catalog row.
// HTTP commands use only Node builtins. The offline command loads the vendored
// MIT checker and its public registry dependencies. It does not fetch a seller
// and it does not accept a fixture name as success.
import { readFileSync, writeFileSync } from "node:fs";

const STATE_SCHEMA = "samedaydesk.public-readiness.client-state.v1";
const MAX_FILE_BYTES = 65_536;
const SUPPLIED_PATH = "/api/public-readiness/supplied-row";

function say(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, origin: null, in: null, state: null, route: null, required: null };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];
    if (arg === "--origin" || arg === "--in" || arg === "--state" || arg === "--route" || arg === "--required") {
      opts[arg.slice(2)] = next ?? "";
      i += 1;
    } else {
      return { error: `unknown argument ${arg}` };
    }
  }
  return opts;
}

function publicOrigin(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    return null;
  }
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

function readJson(file) {
  const raw = readFileSync(file);
  if (raw.byteLength > MAX_FILE_BYTES) fail("input file exceeds the byte limit");
  return JSON.parse(raw.toString("utf8"));
}

async function postRow(origin, body) {
  const response = await fetch(`${origin}${SUPPLIED_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

function changedBody(repairOutput, route, required) {
  if (!repairOutput?.catalogRow || !repairOutput?.responseContract) return null;
  const body = structuredClone(repairOutput);
  body.catalogRow.route = route;
  if (required) body.catalogRow.requiredPaths = required.split(",").filter(Boolean);
  return body;
}

async function begin(opts) {
  const origin = publicOrigin(opts.origin);
  if (!origin || !opts.in || !opts.state) fail("begin requires --origin, --in, and --state");
  const submitted = readJson(opts.in);
  if (submitted && Object.hasOwn(submitted, "fixture")) fail("fixture names are not a supplied row");
  const posted = await postRow(origin, submitted);
  if (posted.status !== 200 || posted.json?.mode !== "supplied-input") {
    say({ event: "began", status: posted.status, error: posted.json?.error ?? null });
    process.exit(1);
  }
  const state = {
    schema: STATE_SCHEMA,
    origin,
    submitted,
    response: posted.json,
  };
  writeFileSync(opts.state, `${JSON.stringify(state)}\n`);
  say({
    event: "began",
    decision: posted.json.observation?.decision ?? null,
    checker: posted.json.versions?.checker ?? null,
    commit: posted.json.versions?.commit ?? null,
    repair: Boolean(posted.json.repair?.output),
    readinessClaimed: posted.json.observation?.readinessClaimed === true,
  });
}

async function resume(opts) {
  if (!opts.state || !opts.route) fail("resume requires --state and --route");
  const state = readJson(opts.state);
  if (state?.schema !== STATE_SCHEMA || !publicOrigin(state.origin)) fail("state file is not a supplied-row client state");
  const originalRoute = state.response?.repair?.input?.route;
  if (typeof originalRoute !== "string" || opts.route === originalRoute) fail("recheck target must change", 2);
  const body = changedBody(state.response?.repair?.output, opts.route, opts.required);
  if (!body) fail("state has no repair output to consume", 2);
  const posted = await postRow(state.origin, body);
  if (posted.status !== 200 || posted.json?.checked?.route !== opts.route) {
    say({ event: "resumed", status: posted.status, error: posted.json?.error ?? null });
    process.exit(1);
  }
  say({
    event: "resumed",
    route: posted.json.checked.route,
    decision: posted.json.observation?.decision ?? null,
    findings: posted.json.observation?.findings ?? null,
    checkerOk: posted.json.observation?.checkerOk === true,
    readinessClaimed: posted.json.observation?.readinessClaimed === true,
    uncertainty: posted.json.observation?.uncertainty ?? null,
    repairComplete: posted.json.repair?.complete === true,
    schemaDigest: posted.json.observation?.schemaDigest ?? null,
    fetched: posted.json.network?.fetched === true,
  });
}

async function offline(opts) {
  if (!opts.state || !opts.route) fail("offline requires --state and --route");
  const state = readJson(opts.state);
  if (state?.schema !== STATE_SCHEMA) fail("state file is not a supplied-row client state");
  const originalRoute = state.response?.repair?.input?.route;
  if (typeof originalRoute !== "string" || opts.route === originalRoute) fail("recheck target must change", 2);
  const body = changedBody(state.response?.repair?.output, opts.route, opts.required);
  if (!body) fail("state has no repair output to consume", 2);
  const { auditSuppliedRow } = await import(new URL("./lib/supplied-row.mjs", import.meta.url));
  const decision = await auditSuppliedRow(body);
  say({
    event: "offline",
    route: decision.checked?.route ?? null,
    decision: decision.observation?.decision ?? null,
    findings: decision.observation?.findings ?? null,
    checkerOk: decision.observation?.checkerOk === true,
    readinessClaimed: decision.observation?.readinessClaimed === true,
    uncertainty: decision.observation?.uncertainty ?? null,
    repairComplete: decision.repair?.complete === true,
    schemaDigest: decision.observation?.schemaDigest ?? null,
    fetched: decision.network?.fetched === true,
    checker: decision.versions?.checker ?? null,
    commit: decision.versions?.commit ?? null,
  });
}

const opts = parseArgs(process.argv.slice(2));
if (opts.error) fail(opts.error);
const commands = { begin, resume, offline };
if (!commands[opts.command]) {
  fail("usage: public-cold-client.mjs begin --origin URL --in row.json --state file | resume --state file --route /changed | offline --state file --route /changed");
}
commands[opts.command](opts).catch((error) => fail(error?.message || "cold client failed"));
