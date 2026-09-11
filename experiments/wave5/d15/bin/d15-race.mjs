#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BIND, contractRecord } from "../lib/contract.mjs";
import { runRace } from "../lib/race.mjs";
import { startRaceServer } from "../lib/http.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `d15-race — freeze caller bytes, mutate the live path, execute SDS52 CLI

Commands:
  run <job-id> --before FILE --after FILE [--bind frozen|verify-live|live-observe]
      [--mutate-after KEY] [--mutate-mode identical-before|overwrite] [--mutate-file FILE]
      [--out-dir DIR]
  listen [--host 127.0.0.1] [--port 0]
  contract

frozen: execute harness freeze copies after the live path mutates (not product acceptance)
verify-live: refuse input-changed-after-preflight when live bytes drifted
live-observe: pass live paths to the in-tree SDS52 CLI and classify mutation consumption
Kernel replay lives in test/kernel-replay.test.mjs against read-only D01 e2f951ca / 6bed72dd / SDS52 aeef964 worktrees.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "contract") {
  process.stdout.write(`${JSON.stringify(contractRecord(), null, 2)}\n`);
  process.exit(0);
}

if (cmd === "listen") {
  const started = await startRaceServer({
    host: String(args.host || "127.0.0.1"),
    port: args.port ? Number(args.port) : 0,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, url: started.url, port: started.port, host: started.host })}\n`);
  const stop = () => {
    started.server.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} else if (cmd === "run") {
  const jobId = args._[1];
  if (!jobId) {
    process.stderr.write("run requires <job-id>\n");
    process.stdout.write(usage());
    process.exit(2);
  }
  const inputs = {};
  for (const key of ["before", "after", "used", "input", "next-run", "input-root"]) {
    if (args[key]) inputs[key] = resolve(String(args[key]));
  }
  let mutate = null;
  if (args["mutate-after"]) {
    mutate = {
      key: String(args["mutate-after"]),
      mode: String(args["mutate-mode"] || "identical-before"),
    };
    if (args["mutate-file"]) mutate.file = resolve(String(args["mutate-file"]));
    if (args["mutate-rel"]) mutate.rel = String(args["mutate-rel"]);
  }
  const result = await runRace({
    jobId,
    inputs,
    bind: String(args.bind || BIND.FROZEN),
    mutate,
    outDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args["out-dir"]) {
    writeFileSync(resolve(String(args["out-dir"]), "d15-race.json"), `${JSON.stringify(result, null, 2)}\n`);
  }
  process.exit(result.kind === "transport-failure" ? 2 : 0);
} else {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}
