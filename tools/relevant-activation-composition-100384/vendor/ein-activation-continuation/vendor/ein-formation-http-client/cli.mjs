#!/usr/bin/env node
/**
 * CLI for the public EIN.LLC formation HTTP flow (/agents/http-quickstart).
 * Zero npm dependencies. Does not claim, pay, or invent grants.
 */
import { pathToFileURL } from "node:url";
import { FormationHttpClient, HttpClientError, DEFAULT_ORIGIN } from "./client.mjs";
import {
  loadGrantToken,
  ENV_GRANT_TOKEN,
  ENV_GRANT_FILE,
  ENV_GRANT_ORIGIN,
} from "./lib/grant.mjs";
import { publicHandoffView, redactSecrets, collectSecrets } from "./lib/redact.mjs";

const HELP = `ein-http-client — standalone public formation HTTPS client (zero npm deps)

Matches https://ein.llc/agents/http-quickstart. Not a private SDK. Not payment automation.

Usage:
  node cli.mjs help
  node cli.mjs discover [--origin URL]
  node cli.mjs assess [--origin URL] < assessment.json
  node cli.mjs prepare [--origin URL] [--show-claim-url] < prepare.json
  node cli.mjs status --application-id ID [--origin URL]

Options:
  --origin URL           Scheme+host (default ORIGIN / EIN_HTTP_ORIGIN / https://ein.llc)
  --application-id ID    Application id for status
  --show-claim-url       Print full claimUrl (default: redact claim token). Also notices stderr.
  --help, -h             Show this help

Environment:
  ORIGIN / EIN_HTTP_ORIGIN   Public origin (https; http loopback only for local verify)
  ${ENV_GRANT_TOKEN}         Human-issued scoped AgentGrant for status
  ${ENV_GRANT_FILE}          Owner-only file (mode 0600) containing the grant
  ${ENV_GRANT_ORIGIN}        Exact origin the grant may be sent to (defaults to https://ein.llc)

Boundaries:
  - discover / assess: anonymous, non-sensitive
  - prepare: ONLY when you explicitly run this command (each call creates a NEW case; no idempotency)
  - claim / pay / confidential intake: humans only (Firebase email match + merchant checkout)
  - status: requires a real human-issued grant from env/file — never invent grants
  - Agents do not claim. Payment is not EIN issued.
`;

function parseArgs(argv) {
  const flags = { showClaimUrl: false, help: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--show-claim-url") flags.showClaimUrl = true;
    else if (arg === "--origin") flags.origin = argv[++i];
    else if (arg === "--application-id") flags.applicationId = argv[++i];
    else if (arg.startsWith("-")) {
      throw new HttpClientError({ code: "invalid_input", message: `unknown flag: ${arg}` });
    } else positionals.push(arg);
  }
  return { command: positionals[0], flags };
}

async function readStdinJson(stdin) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new HttpClientError({ code: "invalid_input", message: "expected JSON on stdin" });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpClientError({ code: "invalid_input", message: "stdin is not valid JSON" });
  }
}

function resolveOrigin(flags, env) {
  return flags.origin || env.ORIGIN || env.EIN_HTTP_ORIGIN || DEFAULT_ORIGIN;
}

export function publicError(error) {
  if (error instanceof HttpClientError) return error.toJSON();
  if (error && typeof error === "object" && error.code === "missing_grant") {
    return {
      error: {
        code: "missing_grant",
        message: error.message,
        status: error.status ?? 401,
        retryable: false,
      },
    };
  }
  return { error: { code: "client_error", message: "client failed safely", retryable: false } };
}

export async function runCli(argv, {
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  stdin = process.stdin,
  stdinJson,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { command, flags } = parseArgs(argv);
  if (!command || command === "help" || flags.help) {
    stdout.write(HELP);
    return 0;
  }

  const origin = resolveOrigin(flags, env);
  let client = new FormationHttpClient({
    origin,
    fetch: fetchImpl,
  });
  let grantToken = null;
  if (command === "status") {
    // Validate and normalize the destination before reading the secret.
    grantToken = loadGrantToken({ env, required: true, origin: client.origin });
    client = new FormationHttpClient({
      origin: client.origin,
      fetch: fetchImpl,
      grantToken,
      grantOrigin: client.origin,
    });
  }

  if (command === "discover") {
    const result = await client.discover();
    stdout.write(
      `${JSON.stringify(
        {
          origin: result.origin,
          catalogSchema: result.catalog?.schema ?? null,
          catalogVersion: result.catalog?.catalogVersion ?? null,
          openapi: result.openapi?.openapi ?? null,
          openapiTitle: result.openapi?.info?.title ?? null,
          paths: Object.keys(result.openapi?.paths || {}),
          note: "Discovery only. See https://ein.llc/agents/http-quickstart",
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  if (command === "assess") {
    const body = stdinJson ?? (await readStdinJson(stdin));
    const result = await client.assess(body);
    stdout.write(`${JSON.stringify(redactSecrets(result), null, 2)}\n`);
    return 0;
  }

  if (command === "prepare") {
    const body = stdinJson ?? (await readStdinJson(stdin));
    const result = await client.prepare(body);
    const view = publicHandoffView(result, { showClaimUrl: flags.showClaimUrl });
    if (flags.showClaimUrl && result.complete && result.claimUrl) {
      stderr.write(
        "NOTICE: printing full claimUrl for human handoff only. Do not log or publish. Agents do not claim.\n",
      );
    }
    stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    return 0;
  }

  if (command === "status") {
    if (!flags.applicationId) {
      throw new HttpClientError({ code: "invalid_input", message: "--application-id is required for status" });
    }
    const result = await client.status({ applicationId: flags.applicationId });
    stdout.write(`${JSON.stringify(redactSecrets(result, collectSecrets(grantToken)), null, 2)}\n`);
    return 0;
  }

  throw new HttpClientError({
    code: "invalid_input",
    message: `unknown command: ${command}. Run: node cli.mjs help`,
  });
}

export { HELP };

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = 1;
  });
}
