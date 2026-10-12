#!/usr/bin/env node
/**
 * Operator CLI for opportunity rounds.
 * Talks to a running earned-work HTTP process. Does not transfer funds,
 * fetch artifact refs, or admit production from a fixture file.
 *
 * stdout is one JSON object: { "status", "body" }.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const command = args[0];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function flags() {
  const out = {};
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) fail(`unexpected argument ${arg}`);
    const key = arg.slice(2);
    const value = args[i + 1];
    if (value == null || value.startsWith("--")) fail(`missing value for ${arg}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function required(flagMap, name) {
  const value = flagMap[name];
  if (!value) fail(`--${name} is required`);
  return value;
}

function baseUrl(flagMap) {
  const raw = (flagMap["base-url"] ?? process.env.OPPORTUNITY_BASE_URL ?? process.env.EARNED_WORK_BASE_URL ?? "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("base URL is malformed");
  }
  if (url.username || url.password || url.search || url.hash) {
    fail("base URL must not include userinfo, a query, or a fragment");
  }
  return raw.replace(/\/$/, "");
}

function token(flagMap) {
  return flagMap.token ?? process.env.EARNED_WORK_OWNER_TOKEN ?? "";
}

function holderToken(flagMap) {
  const value = flagMap.token ?? process.env.OPPORTUNITY_HOLDER_TOKEN ?? "";
  if (!value) fail("set --token or OPPORTUNITY_HOLDER_TOKEN");
  return value;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const USAGE = `usage: opportunity.mjs <command> [flags]
commands: create-round, import, assign, claim, read-round, read-claim, list-claims,
          submit, accept, start, waitlist, cohort, notice, read-notice
flags: --base-url --token --idempotency-key --file --round --claim --provenance --campaign --expect
holder commands claim, read-claim, submit, start, and waitlist use --token or OPPORTUNITY_HOLDER_TOKEN.
They do not fall back to the owner token. The bearer is not printed.
Base URL is --base-url, else OPPORTUNITY_BASE_URL, else EARNED_WORK_BASE_URL.
`;

async function request(method, url, { bearer, idempotencyKey, body }) {
  const headers = new Headers();
  if (body != null) headers.set("content-type", "application/json");
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  const response = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      fail(`non-json response ${response.status}: ${text.slice(0, 500)}`);
    }
  }
  return { status: response.status, body: parsed };
}

async function main() {
  if (!command || command === "help" || command === "--help") {
    process.stderr.write(USAGE);
    process.exit(command ? 0 : 1);
  }
  const flagMap = flags();
  const root = baseUrl(flagMap);
  if (!root) fail("set --base-url, OPPORTUNITY_BASE_URL, or EARNED_WORK_BASE_URL");
  const bearer = token(flagMap);
  const idem = flagMap["idempotency-key"];
  const provenance = flagMap.provenance;

  let result;
  if (command === "create-round") {
    result = await request("POST", `${root}/v1/opportunity-rounds`, {
      bearer,
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "import") {
    const round = required(flagMap, "round");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/imports`, {
      bearer,
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "assign") {
    const round = required(flagMap, "round");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/assignments`, {
      bearer,
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "claim") {
    const round = required(flagMap, "round");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/claims`, {
      bearer: holderToken(flagMap),
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "read-round") {
    const round = required(flagMap, "round");
    const query = provenance ? `?provenance=${encodeURIComponent(provenance)}` : "";
    result = await request("GET", `${root}/v1/opportunity-rounds/${round}${query}`, { bearer: bearer || undefined });
  } else if (command === "read-claim") {
    const round = required(flagMap, "round");
    const claim = required(flagMap, "claim");
    const query = provenance ? `?provenance=${encodeURIComponent(provenance)}` : "";
    result = await request("GET", `${root}/v1/opportunity-rounds/${round}/claims/${claim}${query}`, { bearer: holderToken(flagMap) });
  } else if (command === "list-claims") {
    const round = required(flagMap, "round");
    const query = provenance ? `?provenance=${encodeURIComponent(provenance)}` : "";
    result = await request("GET", `${root}/v1/opportunity-rounds/${round}/claims${query}`, { bearer });
  } else if (command === "submit") {
    const round = required(flagMap, "round");
    const claim = required(flagMap, "claim");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/claims/${claim}/submissions`, {
      bearer: holderToken(flagMap),
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "accept") {
    const round = required(flagMap, "round");
    const claim = required(flagMap, "claim");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/claims/${claim}/accept`, {
      bearer,
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "start") {
    const round = required(flagMap, "round");
    const claim = required(flagMap, "claim");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/claims/${claim}/start`, {
      bearer: holderToken(flagMap),
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "waitlist") {
    const round = required(flagMap, "round");
    result = await request("POST", `${root}/v1/opportunity-rounds/${round}/waitlist`, {
      bearer: holderToken(flagMap),
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "cohort") {
    const round = required(flagMap, "round");
    const query = provenance ? `?provenance=${encodeURIComponent(provenance)}` : "";
    result = await request("GET", `${root}/v1/opportunity-rounds/${round}/cohort${query}`, { bearer });
  } else if (command === "notice") {
    result = await request("POST", `${root}/v1/opportunity-notices`, {
      bearer,
      idempotencyKey: required(flagMap, "idempotency-key"),
      body: readJson(required(flagMap, "file")),
    });
  } else if (command === "read-notice") {
    result = await request("GET", `${root}/v1/opportunity-notices/${encodeURIComponent(required(flagMap, "campaign"))}`, {});
  } else {
    fail(USAGE.trim());
  }

  process.stdout.write(`${JSON.stringify({ status: result.status, body: result.body })}\n`);
  if (flagMap.expect != null && Number(flagMap.expect) !== result.status) {
    fail(`expected HTTP ${flagMap.expect}, got ${result.status}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
