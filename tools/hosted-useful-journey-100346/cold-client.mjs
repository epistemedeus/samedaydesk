#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { UsefulJourneyClient } from "./client.mjs";
import { Budget, JourneyError, parseJson, readFileBounded, readNodeStream } from "./lib/budget.mjs";

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === "help" || command === "--help" || !command) {
    process.stdout.write("Node 22.x: cold-client.mjs evaluate|run|recover|status|result|cancel|export --origin URL [--project ID] [--input FILE|-] [--journal FILE] [--operation-key KEY] [--job ID --task ID]. Auth: USEFUL_JOURNEY_TOKEN environment variable. run requires a durable customer journal. No payment or public write.\n");
    return;
  }
  const flags = {};
  const allowed = new Set(["origin", "project", "input", "journal", "operation-key", "job", "task", "reason", "deadline-ms", "total-bytes", "output-bytes"]);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    if (!args[i]?.startsWith("--") || !allowed.has(key) || !args[i + 1] || flags[key] !== undefined) throw new JourneyError(400, "invalid_arguments");
    flags[key] = args[i + 1];
  }
  const numeric = (key, fallback, min, max) => {
    const value = flags[key] === undefined ? fallback : Number(flags[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new JourneyError(400, "invalid_limits");
    return value;
  };
  const budget = new Budget({ deadlineMs: numeric("deadline-ms", 30_000, 100, 30_000),
    totalBytes: numeric("total-bytes", 524_288, 4096, 524_288), outputBytes: numeric("output-bytes", 65_536, 1024, 65_536) });
  const client = new UsefulJourneyClient({ origin: flags.origin, projectId: flags.project, token: process.env.USEFUL_JOURNEY_TOKEN, budget });
  let input;
  if (["evaluate", "run", "export"].includes(command)) {
    if (!flags.input) throw new JourneyError(400, "caller_input_required");
    input = parseJson(flags.input === "-" ? await readNodeStream(process.stdin, budget) : await readFileBounded(flags.input, budget));
  }
  let result;
  if (command === "evaluate") result = await client.evaluate(input);
  else if (command === "run") result = await client.run(input, flags["operation-key"], flags.journal);
  else if (command === "recover") result = await client.run(null, null, flags.journal, { recover: true });
  else if (command === "status") result = await client.status(flags.job, flags.task);
  else if (command === "result") result = await client.result(flags.job, flags.task);
  else if (command === "cancel") result = await client.cancel(flags.job, flags.task, flags.reason || "caller requested cancellation", flags["operation-key"]);
  else if (command === "export") result = await client.export(flags.job, input);
  else throw new JourneyError(400, "unknown_command");
  const output = JSON.stringify(result);
  if (Buffer.byteLength(output) > budget.outputBytes) throw new JourneyError(413, "output_too_large");
  budget.spend(Buffer.byteLength(output), "stdout");
  process.stdout.write(`${output}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error instanceof JourneyError ? error.code : "input_or_client_unavailable",
      nextAction: error instanceof JourneyError ? error.nextAction : "Check regular input/journal files and current grant. Preserve the original operation for recovery." } })}\n`);
    process.exitCode = 1;
  });
}
