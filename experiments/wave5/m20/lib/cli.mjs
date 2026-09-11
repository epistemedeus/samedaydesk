import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
  ERROR_CODES,
  READOUT_CONTRACT,
  REMAINING_BINDING,
  SDS52_SHA,
  W4_COMMERCE_03,
  W4_COMMERCE_06,
  W4_COMMERCE_16,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { classifyCohort } from "./cohort.mjs";
import { runDryRun } from "./dry-run.mjs";
import { listenReadoutServer } from "./http.mjs";
import { scanSiblingSlots } from "./siblings.mjs";
import { compareTerms } from "./terms.mjs";
import { loadWrapper } from "./wrapper-adapter.mjs";

export function usage() {
  return `W5-M20 first-use / drop-off / repeat-job readout
Consumes SDS PR52 runPaidOffer. Not a live sale.

node bin/readout.mjs status
node bin/readout.mjs classify --in <file-or-dir> [--out file]
node bin/readout.mjs dry-run --buyer-class owner-qa --out-dir /tmp/m20
node bin/readout.mjs siblings
node bin/readout.mjs terms --left file.json --right file.json
node bin/readout.mjs serve --host 127.0.0.1 --port 0
`;
}

export function parseArgs(argv) {
  const out = { command: null, flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--pretty") out.pretty = true;
    else if (arg === "--force-equal") out.forceEqual = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value == null || String(value).startsWith("--")) {
        out.flags[key] = true;
        continue;
      }
      i += 1;
      out.flags[key] = value;
    } else if (!out.command) out.command = arg;
  }
  return out;
}

function printJson(payload, code) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return code;
}

function loadObservationFile(path) {
  const text = readFileSync(path, "utf8");
  const value = JSON.parse(text);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.observations)) return value.observations;
  return [value];
}

function loadObservations(target) {
  const path = resolve(target);
  const st = statSync(path);
  if (st.isDirectory()) {
    const names = readdirSync(path)
      .filter((name) => extname(name) === ".json")
      .sort();
    const rows = [];
    for (const name of names) rows.push(...loadObservationFile(join(path, name)));
    return rows;
  }
  return loadObservationFile(path);
}

export async function runCli(argv, { cwd = process.cwd() } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.command) {
    process.stdout.write(`${usage()}\n`);
    return args.help ? 0 : 2;
  }

  if (args.command === "status") {
    const wrapper = await loadWrapper();
    return printJson(
      {
        ok: true,
        contract: READOUT_CONTRACT,
        testedWrapperPin: SDS52_SHA,
        wrapperExport: wrapper.exportName,
        executionContractOnThisCheckout: wrapper.executionContract,
        w4commerce16: W4_COMMERCE_16,
        w4commerce03: W4_COMMERCE_03,
        w4commerce06: W4_COMMERCE_06,
        remainingBinding: REMAINING_BINDING,
        liveSettlement: "out-of-scope",
      },
      0,
    );
  }

  if (args.command === "siblings") {
    return printJson({ ok: true, contract: READOUT_CONTRACT, siblings: scanSiblingSlots() }, 0);
  }

  if (args.command === "terms") {
    const leftPath = args.flags.left;
    const rightPath = args.flags.right;
    if (!leftPath || !rightPath) {
      return printJson(refuse(ERROR_CODES.MISSING_INPUT, "terms requires --left and --right"), 2);
    }
    const left = JSON.parse(readFileSync(resolve(cwd, leftPath), "utf8"));
    const right = JSON.parse(readFileSync(resolve(cwd, rightPath), "utf8"));
    const compared = compareTerms(left, right, { forceEqual: args.forceEqual === true });
    return printJson(compared, compared.ok ? 0 : 2);
  }

  if (args.command === "classify") {
    const input = args.flags.in;
    if (!input) return printJson(refuse(ERROR_CODES.MISSING_INPUT, "classify requires --in"), 2);
    const observations = loadObservations(resolve(cwd, input));
    if (args.flags["scan-siblings"] === true) {
      observations.unshift(...scanSiblingSlots());
    }
    const readout = classifyCohort(observations);
    if (args.flags.out) {
      writeFileSync(resolve(cwd, args.flags.out), `${JSON.stringify(readout, null, 2)}\n`);
    }
    return printJson(readout, readout.ok ? 0 : 2);
  }

  if (args.command === "dry-run") {
    const body = await runDryRun({
      buyerClass: args.flags["buyer-class"] || args.flags.buyerClass || "owner-qa",
      outDir: args.flags["out-dir"] ? resolve(cwd, args.flags["out-dir"]) : undefined,
    });
    return printJson(body, body.ok ? 0 : 2);
  }

  if (args.command === "serve") {
    const host = args.flags.host || "127.0.0.1";
    const port = args.flags.port ? Number(args.flags.port) : 0;
    const listening = await listenReadoutServer({ host, port });
    process.stdout.write(
      `${JSON.stringify({ ok: true, contract: READOUT_CONTRACT, host: listening.host, port: listening.port }, null, 2)}\n`,
    );
    await new Promise((resolve) => {
      listening.server.on("close", resolve);
    });
    return 0;
  }

  return printJson(refuse(ERROR_CODES.UNKNOWN_COMMAND, "command must be status, classify, dry-run, siblings, terms, or serve"), 2);
}
