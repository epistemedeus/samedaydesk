import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { argumentsFor, baseUrl, inputText, privateText, savePrivate } from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { boundedJson, digest } from "../../../server/vendor/machine-gateway/src/util.mjs";
import { discovery as discoveryLabel, measurementRecord, mintCorrelationId, stepEventId } from "../vendor/task-continuation/index.mjs";
import { CliError, describe } from "./errors.mjs";
import { call as defaultCall, createTransport } from "./transport.mjs";
import { loadCredential } from "./auth.mjs";
import { runBatch } from "./batch.mjs";
import { bashCompletion, fishCompletion, helpFor, zshCompletion } from "./generate.mjs";
import {
  COMMANDS, DEFAULT_ORIGIN, ERROR_SCHEMA, GATEWAY_PATH, GROUPS, MARKET_PATH, RECORD_SCHEMA, RESULT_SCHEMA, STREAM_SCHEMA,
  commandByArgv, commandById, manifest,
} from "./manifest.mjs";

const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
export const CLI_VERSION = PACKAGE.version;

// Same refusal set as agent-economy-client 0.3.0 src/cli.mjs FORBIDDEN.
const FORBIDDEN = new Set(["password", "cookie", "token", "secret", "recovery-code", "recoverycode", "private-key", "privatekey", "seed", "csrf", "session", "session-token", "bearer", "api-key", "license"]);
const READINESS_SCHEMA = "agent-readiness.report.v1";
const STDIN_LIMIT = 131072;

export function parse(argv) {
  const positionals = [];
  let index = 0;
  while (index < argv.length && !argv[index].startsWith("--")) positionals.push(argv[index++]);
  const rest = argv.slice(index);
  for (const token of rest) {
    if (!token.startsWith("--")) continue;
    const name = token.slice(2).split("=")[0].toLowerCase();
    if (FORBIDDEN.has(name)) throw new CliError("secret_in_argv_refused");
  }
  return { positionals, rest };
}

function flagsFor(command, rest) {
  const specs = command.flags || {};
  const names = Object.keys(specs);
  const booleans = names.filter(name => specs[name].type === "boolean");
  let flags;
  try { flags = argumentsFor(rest, names, booleans); }
  catch { throw new CliError("invalid_arguments", { allowed: names }); }
  for (const [name, spec] of Object.entries(specs)) {
    const value = flags[name];
    if (value === undefined) {
      if (spec.required) throw new CliError("input_required", { flag: name });
      continue;
    }
    if (spec.type === "integer") {
      const number = Number(value);
      if (!Number.isInteger(number) || number < spec.minimum || number > spec.maximum) throw new CliError("invalid_input", { flag: name });
      flags[name] = number;
    }
    if (spec.enum && !spec.enum.includes(value)) throw new CliError("invalid_input", { flag: name, allowed: spec.enum });
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) throw new CliError("invalid_input", { flag: name });
    if (spec.maxLength && value.length > spec.maxLength) throw new CliError("invalid_input", { flag: name });
  }
  return flags;
}

function originOf(flags) {
  const raw = flags.origin ?? DEFAULT_ORIGIN;
  let url;
  try { url = new URL(raw); } catch { throw new CliError("origin_refused"); }
  const loopback = ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.origin !== raw || url.username || url.password) throw new CliError("origin_refused");
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback && flags["allow-loopback"]))) throw new CliError("origin_refused");
  return url.origin;
}

function gatewayBase(flags) {
  try { return baseUrl(`${originOf(flags)}${GATEWAY_PATH}`, Boolean(flags["allow-loopback"])); }
  catch (error) { if (error instanceof CliError) throw error; throw new CliError("origin_refused"); }
}

// Local preview: validated locally, nothing sent. A remote quote is a
// different thing (gateway quote) and says so in its own output.
function plan(command, method, url, body) {
  return { kind: "local_preview", dryRun: true, sent: false, request: { method, url, ...(body === undefined ? {} : { body }) }, effect: command.effect, auth: command.auth,
    recoveryClass: command.recoveryClass,
    liveUnknown: ["current availability", "current price", "server acceptance of this input"],
    requiredAuthorityForNextStep: command.requiredAuthorityForNextStep ?? null };
}

// Handback for a second entitled process: nonsecret native references, time,
// contract and required next authority only. Never a credential.
function handback({ operationId, origin, contract, references, observedAt, applicability, requiredNextAuthority = null }) {
  return { schema: "samedaydesk.cli.handback.v1", operationId, origin, contract, references, observedAt, applicability,
    rights: { stated: false, note: "No usage rights are stated by the server for this result." }, requiredNextAuthority, credentialsIncluded: false };
}

// Persist the attempt identity before a POST whose recovery is unresolved.
// Failure to persist stops the dispatch; success is not a promise that the
// server applied or did not apply the request.
function persistRecovery(flags, command, origin, path, body, io) {
  const record = { schema: "samedaydesk.cli.recovery-record.v1", command: command.id, operationId: command.http[0].operationId, recoveryClass: command.recoveryClass,
    origin, method: "POST", path, inputDigest: digest(body), attemptId: randomUUID(), correlationId: mintCorrelationId(), createdAt: io.now().toISOString(),
    meaning: "Written before dispatch. It identifies the attempt; it does not show whether the server applied it." };
  if (flags["recovery-file"] === undefined) return { persisted: false, recoveryClass: command.recoveryClass };
  if (!isAbsolute(flags["recovery-file"]) || existsSync(flags["recovery-file"])) throw new CliError("recovery_record_failed");
  try { savePrivate(flags["recovery-file"], `${JSON.stringify(record)}\n`, { exclusive: true }); }
  catch { throw new CliError("recovery_record_failed"); }
  return { persisted: true, file: flags["recovery-file"], attemptId: record.attemptId, correlationId: record.correlationId, recoveryClass: command.recoveryClass };
}

async function readStdin(stdin) {
  if (!stdin || stdin.isTTY) throw new CliError("input_required", { flag: "input-file" });
  let size = 0;
  const chunks = [];
  for await (const chunk of stdin) {
    size += chunk.length;
    if (size > STDIN_LIMIT) throw new CliError("input_too_large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonInput(text) {
  try { return boundedJson(text, STDIN_LIMIT); }
  catch (error) { throw new CliError(error?.code === "body_too_large" ? "input_too_large" : "invalid_input"); }
}

function compactRoutes(discovery) {
  return (discovery?.routes ?? []).map(route => ({ id: route.id, version: route.version, description: route.description, price: route.price,
    timeoutMs: route.timeoutMs, maxOutputBytes: route.maxOutputBytes, executable: route.executable,
    inputSchemaPath: route.inputSchemaPath, outputSchemaPath: route.outputSchemaPath }));
}

const HANDLERS = {
  help: async ({ positional }) => {
    const value = helpFor(positional ?? null);
    if (!value) throw new CliError("invalid_input", { positional: "group", known: GROUPS.map(group => group.id) });
    return { schema: "samedaydesk.cli.help.v1", cliVersion: CLI_VERSION, noninteractive: true, ...value };
  },
  completion: async ({ positional, io }) => {
    const build = { bash: bashCompletion, zsh: zshCompletion, fish: fishCompletion }[positional];
    if (!build) throw new CliError("invalid_input", { positional: "shell", known: ["bash", "zsh", "fish"] });
    return { raw: build() };
  },
  version: async () => ({ schema: "samedaydesk.cli.version.v1", name: PACKAGE.name, version: CLI_VERSION, node: PACKAGE.engines.node, manifest: "samedaydesk.cli.manifest.v1" }),
  commands: async ({ flags }) => {
    if (flags.group && !GROUPS.some(group => group.id === flags.group)) throw new CliError("invalid_input", { flag: "group" });
    return manifest(CLI_VERSION, flags.group);
  },
  schema: async ({ positional }) => {
    const target = commandById(positional ?? "");
    if (!target) throw new CliError("unknown_command", { known: COMMANDS.map(command => command.id) });
    return { schema: "samedaydesk.cli.command.v1", cliVersion: CLI_VERSION, command: target };
  },
  capabilities: async ({ flags, command, io }) => {
    const base = gatewayBase(flags);
    const market = `${originOf(flags)}${MARKET_PATH}`;
    if (flags["dry-run"]) return { ...plan(command, "GET", `${base}/healthz`), alsoReads: [`${base}/v1/discover`, `${market}/v1/market/profile`] };
    const sources = {};
    const read = async (name, origin, path) => {
      try { const { value, attempts } = await io.call(origin, path, { sleep: io.sleep }); sources[name] = { ok: true, attempts, value }; }
      catch (error) { const { code, category } = describe(error); sources[name] = { ok: false, code, category }; }
    };
    await read("gatewayHealth", base, "/healthz");
    await read("gatewayRoutes", base, "/v1/discover");
    await read("marketProfile", market, "/v1/market/profile");
    if (!Object.values(sources).some(source => source.ok)) throw new CliError("unavailable", { sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.code])) });
    const health = sources.gatewayHealth.ok ? sources.gatewayHealth.value : null;
    const routes = sources.gatewayRoutes.ok ? sources.gatewayRoutes.value : null;
    const profile = sources.marketProfile.ok ? sources.marketProfile.value?.value ?? null : null;
    return {
      schema: "samedaydesk.cli.capabilities.v1",
      origin: originOf(flags),
      status: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.ok ? "ok" : source.code])),
      gateway: { ready: health?.ready ?? null, paymentsEnabled: health?.paymentsEnabled ?? routes?.paymentsEnabled ?? null, version: routes?.version ?? null,
        routes: compactRoutes(routes), executeRequires: "tenantBearer (operator-enrolled; not self-serve)" },
      market: profile ? { money: profile.capability?.money ?? null, discovery: profile.capability?.discovery ?? null, signerAuthority: profile.signerAuthority ?? null,
        participation: profile.participation?.protocol ?? null } : null,
      credentialFreeTasks: ["readiness.check"],
      next: "samedaydesk schema readiness.check",
    };
  },
  "gateway.routes": async ({ flags, command, io }) => {
    const base = gatewayBase(flags);
    if (flags["dry-run"]) return plan(command, "GET", `${base}/v1/discover`);
    const { value, attempts } = await io.call(base, "/v1/discover", { sleep: io.sleep });
    return { ...value, attempts };
  },
  "gateway.schema": async ({ flags, command, io }) => {
    const base = gatewayBase(flags);
    const path = `/v1/routes/${flags.route}/${flags.kind ?? "input"}.schema.json`;
    if (flags["dry-run"]) return plan(command, "GET", `${base}${path}`);
    return (await io.call(base, path, { sleep: io.sleep })).value;
  },
  "gateway.test": async ({ flags, command, io }) => {
    const base = gatewayBase(flags);
    const body = { routeId: flags.route };
    if (flags["dry-run"]) return plan(command, "POST", `${base}/v1/test`, body);
    const recovery = persistRecovery(flags, command, base, "/v1/test", body, io);
    const { value } = await io.call(base, "/v1/test", { body, sleep: io.sleep });
    return { fixture: true, providerCalled: false, recovery, value };
  },
  "gateway.quote": async ({ flags, command, io }) => {
    const base = gatewayBase(flags);
    let text;
    if (flags["input-file"] === "-") text = await readStdin(io.stdin);
    else {
      try { text = inputText(flags["input-file"]); }
      catch { throw new CliError("invalid_input_file"); }
    }
    const body = { routeId: flags.route, input: parseJsonInput(text) };
    if (flags["dry-run"]) return plan(command, "POST", `${base}/v1/quote`, body);
    const recovery = persistRecovery(flags, command, base, "/v1/quote", body, io);
    const { value } = await io.call(base, "/v1/quote", { body, sleep: io.sleep });
    const tenantBound = value?.tenantBound === true;
    const observedAt = io.now().toISOString();
    return {
      kind: "remote_quote",
      sent: true,
      anonymous: true,
      reservation: tenantBound ? "tenant_bound_by_server" : "none",
      serverExpiresAt: Number.isSafeInteger(value?.expiresAt) ? value.expiresAt : null,
      executable: value?.executable === true,
      tenantBound,
      quote: value,
      recovery,
      requiredAuthorityForNextStep: command.requiredAuthorityForNextStep,
      handback: handback({ operationId: "quoteRoute", origin: base, contract: "neomorphic.machine-gateway.quote.v1",
        references: { quoteId: typeof value?.quoteId === "string" ? value.quoteId : null, routeId: flags.route, inputDigest: typeof value?.inputDigest === "string" ? value.inputDigest : digest(body.input) },
        observedAt, applicability: "Anonymous quote for this exact input at observedAt. Not executable and not a reservation.",
        requiredNextAuthority: command.requiredAuthorityForNextStep }),
    };
  },
  "market.profile": async ({ flags, command, io }) => {
    const market = `${originOf(flags)}${MARKET_PATH}`;
    if (flags["dry-run"]) return plan(command, "GET", `${market}/v1/market/profile`);
    const { value } = await io.call(market, "/v1/market/profile", { sleep: io.sleep });
    if (value?.ok !== true) throw new CliError("response_invalid");
    return value.value;
  },
  "market.discover": async ({ flags, command, io, emit }) => {
    const market = `${originOf(flags)}${MARKET_PATH}`;
    const limit = flags.limit ?? 20;
    const pathFor = cursor => `/v1/market/discover?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    if (flags["dry-run"]) return plan(command, "GET", `${market}${pathFor(flags.cursor)}`);
    const page = async cursor => {
      const { value } = await io.call(market, pathFor(cursor), { sleep: io.sleep });
      if (value?.ok !== true || !Array.isArray(value.value?.items)) throw new CliError("response_invalid");
      return value.value;
    };
    if (!flags.stream) return page(flags.cursor);
    const maxPages = flags["max-pages"] ?? 3;
    let cursor = flags.cursor ?? null;
    let pages = 0;
    let count = 0;
    try {
      do {
        const value = await page(cursor);
        pages += 1;
        count += value.items.length;
        cursor = value.nextCursor ?? null;
        await emit({ schema: STREAM_SCHEMA, type: "page", command: command.id, page: pages, items: value.items, nextCursor: cursor });
      } while (cursor && pages < maxPages);
    } catch (error) {
      const described = describe(error);
      // A refused cursor is not resumable: restart pagination from the first page.
      const refused = ["cursor_refused", "cursor_malformed", "cursor_unrecognized"].includes(described.code);
      await emit({ schema: STREAM_SCHEMA, type: "end", command: command.id, ok: false, pages, count, resumeCursor: refused ? null : cursor, restartWithoutCursor: refused, error: described });
      return { streamed: true, exit: described.exit };
    }
    await emit({ schema: STREAM_SCHEMA, type: "end", command: command.id, ok: true, pages, count, nextCursor: cursor });
    return { streamed: true, exit: 0 };
  },
  "readiness.check": async ({ flags, command, io }) => {
    const origin = originOf(flags);
    const path = `/agent-readiness?host=${encodeURIComponent(flags.host)}&format=json`;
    if (flags.out !== undefined) {
      if (!isAbsolute(flags.out)) throw new CliError("absolute_private_file_required");
      if (existsSync(flags.out)) throw new CliError("output_exists");
    }
    if (flags["dry-run"]) return plan(command, "GET", `${origin}${path}`);
    const { value: report, attempts } = await io.call(origin, path, { sleep: io.sleep });
    if (report?.schema !== READINESS_SCHEMA) throw new CliError("response_invalid");
    const correlationId = mintCorrelationId();
    const record = {
      schema: RECORD_SCHEMA,
      command: command.id,
      operationId: "check_agent_readiness",
      origin,
      request: { method: "GET", path },
      correlationId,
      step: 0,
      stepEventId: stepEventId(correlationId, 0, "samedaydesk-cli"),
      // task-continuation 1.1.0: discovery lives only on the separate measurement record.
      measurement: measurementRecord({
        correlationId,
        discovery: discoveryLabel({ declared: flags.discovery ?? null, sources: command.flags.discovery.enum }),
        step: 0,
        tool: "check_agent_readiness",
        outcome: "report_received",
      }),
      receivedAt: io.now().toISOString(),
      attempts,
      reportDigest: digest(report),
      report,
    };
    record.handback = handback({ operationId: "check_agent_readiness", origin, contract: READINESS_SCHEMA,
      references: { correlationId, stepEventId: record.stepEventId, reportDigest: record.reportDigest, host: flags.host, recordPath: flags.out ?? null },
      observedAt: record.receivedAt, applicability: `Readiness of ${flags.host} as observed at receivedAt.` });
    let saved = null;
    if (flags.out !== undefined) {
      try { savePrivate(flags.out, `${JSON.stringify(record)}\n`, { exclusive: true }); saved = flags.out; }
      catch (error) { throw new CliError(error?.code === "EEXIST" ? "output_exists" : "invalid_private_file"); }
    }
    return { ...record, saved };
  },
  "batch.run": async ({ flags, io }) => {
    if (!flags["dry-run"] && flags["state-dir"] === undefined) throw new CliError("input_required", { flag: "state-dir" });
    const origin = originOf(flags);
    const bases = { origin, gateway: gatewayBase(flags), market: `${origin}${MARKET_PATH}` };
    const credential = await loadCredential(flags, { origin, scopePath: GATEWAY_PATH, stdin: io.stdin });
    return runBatch(flags, { origin, bases, credential, transport: io.transport, stdin: io.stdin, stdout: io.stdout, stderr: io.stderr,
      signal: io.signal, now: io.now, sleep: io.sleep, cliVersion: CLI_VERSION });
  },
  "result.show": async ({ flags }) => {
    let record;
    try { record = JSON.parse(privateText(flags.file)); }
    catch (error) {
      if (error?.message === "absolute_private_file_required") throw new CliError("absolute_private_file_required");
      throw new CliError("result_file_invalid");
    }
    if (record?.schema !== RECORD_SCHEMA || typeof record.reportDigest !== "string" || digest(record.report) !== record.reportDigest) throw new CliError("result_file_invalid");
    return { ...record, verified: true, recoveredOffline: true };
  },
};

function writeLine(stream, value) {
  return new Promise(resolve => {
    try {
      stream.write(`${JSON.stringify(value)}\n`, () => resolve());
    } catch { resolve(); }
  });
}

export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const transport = io.clientIo ? createTransport(io.clientIo) : { call: defaultCall };
  const context = { stdin: io.stdin ?? process.stdin, stdout, stderr, transport, sleep: io.sleep, now: io.now ?? (() => new Date()), signal: io.signal,
    call: (base, path, options = {}) => transport.call(base, path, { ...options, signal: io.signal }) };
  // A lost stdout consumer does not cancel anything; it only ends output.
  stdout.on?.("error", () => {});
  let command = null;
  try {
    const { positionals, rest } = parse(argv);
    if (positionals.length === 0) positionals.push("help");
    command = commandByArgv(positionals);
    if (!command) throw new CliError("unknown_command", { known: COMMANDS.map(entry => entry.id) });
    const positional = command.positional ? positionals[command.argv.length] : undefined;
    const flags = flagsFor(command, rest);
    const emit = value => writeLine(stdout, value);
    const result = await HANDLERS[command.id]({ flags, positional, command, io: context, emit });
    if (result?.streamed) return result.exit;
    if (typeof result?.raw === "string") { await new Promise(resolve => { try { stdout.write(result.raw, () => resolve()); } catch { resolve(); } }); return 0; }
    await writeLine(stdout, { schema: RESULT_SCHEMA, ok: true, command: command.id, cliVersion: CLI_VERSION, result });
    return 0;
  } catch (error) {
    const described = describe(error);
    await writeLine(stdout, { schema: ERROR_SCHEMA, ok: false, command: command?.id ?? null, cliVersion: CLI_VERSION, error: described });
    await writeLine(stderr, { schema: "samedaydesk.cli.diagnostic.v1", code: described.code, exit: described.exit });
    return described.exit;
  }
}
