// Private fixed executor. Caller input is data, never code, path or shell.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRecipe } from "../../recurring-job-recipes/lib/run.mjs";
import { Budget, parseJson, readNodeStream } from "./budget.mjs";

const budget = new Budget({ deadlineAt: Number(process.env.USEFUL_CHILD_DEADLINE_AT),
  totalBytes: Number(process.env.USEFUL_CHILD_ALLOWANCE), outputBytes: Number(process.env.USEFUL_CHILD_OUTPUT) });
let dir;
try {
  const request = parseJson(await readNodeStream(process.stdin, budget));
  dir = process.env.USEFUL_CHILD_INPUT_DIR || await mkdtemp(join(tmpdir(), "sds-useful-input-"));
  const aliases = new Map();
  async function materialize(name, data, isHtml = false) {
    budget.check();
    const path = join(dir, `${name}.${isHtml ? "html" : "json"}`);
    const text = isHtml ? data : JSON.stringify(data);
    budget.spend(Buffer.byteLength(text), "materialized-input");
    await writeFile(path, text, { flag: "wx", mode: 0o600 });
    aliases.set(path, `caller-snapshot:${name}`);
    return path;
  }
  const supplied = request.input;
  const input = { clock: supplied.clock, scheduleHint: supplied.scheduleHint, horizonHours: supplied.horizonHours,
    fields: supplied.fields, retries: 0, liveSafe: false };
  if (supplied.prior) input.priorPath = await materialize("prior", supplied.prior);
  if (supplied.current) input.currentFixturePath = await materialize("current", supplied.current.data, supplied.current.kind === "html");
  if (supplied.issue) input.issueFixturePath = await materialize("issue", supplied.issue);
  if (supplied.candidate) input.candidatePath = await materialize("candidate", supplied.candidate);
  if (supplied.sources) input.sources = await Promise.all(supplied.sources.map(async (s, i) => ({
    kind: "fixture", sourceKey: s.id, path: await materialize(`source-${i}`, s.data, s.kind === "html") })));
  // The owning engine reads exactly these bounded materialized regular files.
  budget.spend(budget.counts["materialized-input"] || 0, "source-read");
  budget.check();
  const result = await runRecipe(request.recipeId, input);
  budget.check();
  // Temporary file names are implementation details. "fixture" is the existing
  // engine's local read port; these bytes came from this caller, not pack samples.
  const clean = value => typeof value === "string" ? [...aliases].reduce((s, [path, alias]) => s.split(path).join(alias), value)
    : Array.isArray(value) ? value.map(clean) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)])) : value;
  const output = { result: clean(result), source: { kind: "caller_supplied_snapshots", independentlyFetched: false,
    trusted: false, networkUsed: false, paymentAttempted: false, inputDigest: request.inputDigest }, childUsage: budget.snapshot() };
  const text = JSON.stringify(output);
  if (Buffer.byteLength(text) > budget.outputBytes) throw Error("output_limit");
  budget.spend(Buffer.byteLength(text), "child-output");
  process.stdout.write(`${text}\n`);
} catch {
  process.exitCode = 1;
} finally {
  if (dir) await rm(dir, { recursive: true, force: true });
}
