import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES } from "./constants.mjs";
import { comparePageChange, envelope } from "./compare.mjs";
import { normalizeFields } from "./fields.mjs";
import { jobDir, readBoundedJson, resolveJobPath, writeOutputs } from "./io.mjs";
import { isPaymentRetryArg, refuseLiveFetch, refusePaymentRetry, refuseSampleAsDelivered } from "./refuse.mjs";
import { renderJson, renderMarkdown } from "./render.mjs";
import { assertTermsVersion } from "./hash-terms.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(here, "..");
export const SDS_ROOT = resolve(PACKAGE_ROOT, "../..");
export const PUBLISHED_CUSTOMER_JOB = join(
  SDS_ROOT,
  "tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/job.json",
);

const ALLOWED = new Set([
  "before",
  "after",
  "job",
  "clock",
  "fields",
  "out-dir",
  "fixture",
  "max-bytes",
  "max-stale-ms",
  "max-sources",
  "max-fields",
  "max-changes",
]);

function usage() {
  return `Usage:
  page-change compare --before PATH --after PATH --fields title,description,headings --clock ISO8601Z --out-dir DIR
  page-change job --job PATH [--clock ISO8601Z] [--fields title,description,headings] --out-dir DIR
  page-change journey [--fixture PATH]

Compare two already-held samedaydesk.extract-batch.v0 JSON files on selected fields.
Does not fetch URLs, pay, retry payment, or import merchant compare.mjs.
Clock is required. SAMPLE/--example is not a delivered watch.
`;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--example" || token === "--sample") {
      fail(ERROR_CODES.SAMPLE_AS_DELIVERED_WATCH, "SAMPLE or --example is not a delivered watch");
    }
    if (token === "--delivered-watch") {
      fail(ERROR_CODES.SAMPLE_AS_DELIVERED_WATCH, "SAMPLE or --example is not a delivered watch");
    }
    if (token === "--live-url" || token === "--fetch" || token === "--live" || token === "--live-safe") {
      fail(ERROR_CODES.LIVE_FETCH_URL, "live fetch URL input is refused; this job does not fetch");
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (isPaymentRetryArg(key) || key === "retry-payment" || key === "auto-pay" || key === "approve") {
        fail(ERROR_CODES.PAYMENT_RETRY, "payment retry is refused; this job does not pay or replay authorization");
      }
      if (key === "treat-quote-as-success" || key === "success-from-quote") {
        fail(ERROR_CODES.QUOTE_AS_SUCCESS, "extract quote is not page-change success; compare sources[].data only");
      }
      if (!ALLOWED.has(key)) fail(ERROR_CODES.USAGE, `unknown option --${key}`);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail(ERROR_CODES.USAGE, `missing value for --${key}`);
      args[key] = value;
      i += 1;
      continue;
    }
    args._.push(token);
  }
  return args;
}

function integerFlag(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    fail(ERROR_CODES.USAGE, `${field} must be a finite non-negative integer`);
  }
  return number;
}

function limitsFromArgs(args) {
  const limits = {};
  if (args["max-bytes"] !== undefined) limits.maxBytes = integerFlag(args["max-bytes"], "max-bytes");
  if (args["max-stale-ms"] !== undefined) limits.maxStaleMs = integerFlag(args["max-stale-ms"], "max-stale-ms");
  if (args["max-sources"] !== undefined) limits.maxSources = integerFlag(args["max-sources"], "max-sources");
  if (args["max-fields"] !== undefined) limits.maxFields = integerFlag(args["max-fields"], "max-fields");
  if (args["max-changes"] !== undefined) limits.maxChanges = integerFlag(args["max-changes"], "max-changes");
  return limits;
}

function loadJob(path) {
  const file = readBoundedJson(path);
  const raw = file.parsed;
  refuseSampleAsDelivered({}, raw);
  refusePaymentRetry({}, raw);
  if (typeof raw.termsVersion === "number") {
    fail(ERROR_CODES.INTEGER_TERMS_VERSION, "integer termsVersion is rejected; use sha256: + 64 hex");
  }
  if (raw.termsVersion != null) assertTermsVersion(raw.termsVersion);
  if (!raw.before || !raw.after) fail(ERROR_CODES.USAGE, "job file requires before and after paths");
  if (!raw.fields) fail(ERROR_CODES.FIELDS_REQUIRED, "job file requires explicit fields");
  const root = jobDir(path);
  refuseLiveFetch(raw.before, raw.after, raw);
  return {
    ...raw,
    fields: normalizeFields(raw.fields),
    before: resolveJobPath(root, raw.before),
    after: resolveJobPath(root, raw.after),
  };
}

function requireOutDir(args) {
  if (!args["out-dir"]) fail(ERROR_CODES.USAGE, "requires --out-dir so page-change.json and page-change.md can be written");
  return args["out-dir"];
}

export async function runCli(argv, io = process) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? ERROR_CODES.USAGE, message: error.message })}\n`);
    if (error.code === ERROR_CODES.USAGE) io.stderr.write(usage());
    return { exitCode: 2, error };
  }
  if (args.help || args._.length === 0) {
    io.stdout.write(usage());
    return { exitCode: args.help ? 0 : 2 };
  }
  try {
    const command = args._[0];
    if (command === "compare") {
      if (!args.before || !args.after) fail(ERROR_CODES.USAGE, "compare requires --before and --after");
      if (!args.fields) fail(ERROR_CODES.FIELDS_REQUIRED, "compare requires --fields");
      const outDir = requireOutDir(args);
      const report = await comparePageChange({
        beforePath: args.before,
        afterPath: args.after,
        fields: args.fields,
        clock: args.clock,
        limits: limitsFromArgs(args),
      });
      const body = envelope(null, report);
      const written = writeOutputs(outDir, renderJson(body), renderMarkdown(report));
      io.stdout.write(renderJson({ ok: true, ...body, written }));
      return { exitCode: 0, body, written };
    }
    if (command === "job") {
      if (!args.job) fail(ERROR_CODES.USAGE, "job requires --job");
      const job = loadJob(args.job);
      const outDir = requireOutDir(args);
      const report = await comparePageChange({
        beforePath: job.before,
        afterPath: job.after,
        fields: args.fields ? normalizeFields(args.fields) : job.fields,
        clock: args.clock ?? job.clock,
        limits: { ...(job.limits ?? {}), ...limitsFromArgs(args) },
      });
      const body = envelope(job, report);
      const written = writeOutputs(outDir, renderJson(body), renderMarkdown(report, { job }));
      io.stdout.write(renderJson({ ok: true, ...body, written }));
      return { exitCode: 0, body, written };
    }
    if (command === "journey") {
      const fixture = args.fixture ?? PUBLISHED_CUSTOMER_JOB;
      const job = loadJob(fixture);
      const outDir = args["out-dir"] ?? join(PACKAGE_ROOT, "tmp-journey");
      const report = await comparePageChange({
        beforePath: job.before,
        afterPath: job.after,
        fields: job.fields,
        clock: args.clock ?? job.clock,
        limits: { ...(job.limits ?? {}), ...limitsFromArgs(args) },
        evidenceClass: "fixture",
      });
      const body = envelope(job, report);
      const written = writeOutputs(outDir, renderJson(body), renderMarkdown(report, { job }));
      io.stdout.write(renderJson({ ok: true, journey: true, ...body, written }));
      return { exitCode: 0, body, written };
    }
    fail(ERROR_CODES.USAGE, `unknown command: ${command}`);
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? "error", message: error.message })}\n`);
    return { exitCode: 2, error };
  }
}
