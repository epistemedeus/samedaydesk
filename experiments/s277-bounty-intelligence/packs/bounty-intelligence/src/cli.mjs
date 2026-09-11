import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listAdapters } from "./adapters/index.mjs";
import { ingestAll, PACK_ROOT } from "./ingest.mjs";
import { buildReport } from "./report.mjs";
import { renderHtml } from "./html.mjs";
import { liveCapture } from "./capture.mjs";
import { mergePolicy } from "./policy.mjs";
import { TEST_NOW } from "./constants.mjs";
import { compactEvents } from "./events.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

function policyFromArgs(args) {
  const o = {};
  if (args["effort-hours"] != null) o.effortHours = args["effort-hours"];
  if (args["hourly-cost"] != null) o.hourlyCostAmount = args["hourly-cost"];
  if (args["stale-after"] != null) o.staleAfterSeconds = Number(args["stale-after"]);
  if (args["include-forum-rewards"]) o.includeForumRewards = true;
  if (args["include-lab-schedule"]) o.includeLabSchedule = true;
  if (args["max-uncertainty"] != null) o.maxUncertainty = args["max-uncertainty"];
  if (args["assumed-fee-bps"] != null) o.assumedFeeBps = args["assumed-fee-bps"];
  return mergePolicy(o);
}

function writeOut(path, data, { json = true } = {}) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json ? JSON.stringify(data, null, 2) + "\n" : data);
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "help";
  const now = args.now || (args["test-now"] ? TEST_NOW : undefined);

  if (cmd === "help" || args.help) {
    stdout.write(`bounty-intelligence — S277 comparison pack (not a marketplace)

Commands:
  adapters
  ingest   --fixture-dir DIR --now ISO --limit N [--out FILE]
  report   (ingest + rank + select + events)  --out FILE [--html FILE]
  rank     --input report.json
  select   --input report.json
  render   --input report.json --out FILE.html
  events   --input report.json
  capture  --out DIR --limit N
  policy   (print default rank policy)

Flags:
  --effort-hours --hourly-cost --stale-after --max-uncertainty
  --include-forum-rewards --include-lab-schedule --assumed-fee-bps
  --now ISO  --limit N
`);
    return 0;
  }

  if (cmd === "adapters") {
    stdout.write(JSON.stringify({ adapters: listAdapters() }, null, 2) + "\n");
    return 0;
  }

  if (cmd === "policy") {
    stdout.write(JSON.stringify(mergePolicy(), null, 2) + "\n");
    return 0;
  }

  if (cmd === "ingest" || cmd === "report") {
    const fixtureDir = args["fixture-dir"]
      ? resolve(args["fixture-dir"])
      : join(PACK_ROOT, "fixtures/labelled");
    const ingest = await ingestAll({
      mode: args.live ? "live" : "fixture",
      fixtureDir,
      now,
      limit: args.limit ? Number(args.limit) : 5,
    });
    if (cmd === "ingest") {
      stdout.write(JSON.stringify(ingest, null, 2) + "\n");
      if (args.out) writeOut(args.out, ingest);
      return 0;
    }
    const report = buildReport({ ingest, policy: policyFromArgs(args), now });
    stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (args.out) writeOut(args.out, report);
    if (args.html) writeOut(args.html, renderHtml(report), { json: false });
    return 0;
  }

  if (cmd === "capture") {
    const outDir = args.out || join(PACK_ROOT, "receipts/live-capture");
    const index = await liveCapture({
      outDir,
      limit: args.limit ? Number(args.limit) : 5,
      now,
    });
    stdout.write(JSON.stringify(index, null, 2) + "\n");
    return 0;
  }

  if (["rank", "select", "render", "events"].includes(cmd)) {
    if (!args.input) {
      stderr.write("missing --input report.json\n");
      return 2;
    }
    const report = JSON.parse(readFileSync(args.input, "utf8"));
    if (cmd === "rank") {
      stdout.write(JSON.stringify({ ranked: report.ranked, excludedSample: report.excludedSample }, null, 2) + "\n");
      return 0;
    }
    if (cmd === "select") {
      stdout.write(JSON.stringify(report.selected, null, 2) + "\n");
      return 0;
    }
    if (cmd === "events") {
      const events = report.events || compactEvents({ records: report.records || [], now });
      stdout.write(JSON.stringify({ events }, null, 2) + "\n");
      return 0;
    }
    if (cmd === "render") {
      const html = renderHtml(report);
      if (args.out) writeOut(args.out, html, { json: false });
      else stdout.write(html);
      return 0;
    }
  }

  stderr.write(`unknown command: ${cmd}\n`);
  return 2;
}

void here;
