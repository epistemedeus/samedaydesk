#!/usr/bin/env node
/**
 * W3-14 / H03 — rights-cleared public-data corrections.
 * Local fixtures only. No fetch, no private customer data, no auto-publish.
 */
import { resolve } from "node:path";
import { checkFixture, runJourney } from "../lib/journey.mjs";

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
  return `public-data-corrections — rights-cleared public collection (no private data)

Commands:
  journey --fixture <packet.json>
  check --fixture <packet.json>

Literal journey:
  cd tools/public-data-corrections
  node bin/public-data-corrections.mjs journey --fixture fixtures/ok.json

Does not scrape, fetch, auto-publish, or invent a paying rights holder.
Unknown rights cannot publish. publishAuthorized is always false.
H3 Neo ledger is out of directory.
`;
}

function emit(result, exit) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(exit);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h" || args.help === true) {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd !== "journey" && cmd !== "check") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

if (!args.fixture || args.fixture === true) {
  emit(
    {
      ok: false,
      rights: null,
      publishAuthorized: false,
      purchaseAuthorized: false,
      code: "fixture-required",
      error: "--fixture is required",
    },
    2,
  );
}

const fixturePath = resolve(String(args.fixture));

if (cmd === "check") {
  const result = checkFixture(fixturePath);
  emit(result, result.ok ? 0 : 2);
}

const privateFixture = args["private-fixture"]
  ? resolve(String(args["private-fixture"]))
  : undefined;

const result = runJourney({
  fixturePath,
  privateFixturePath: privateFixture,
});
emit(result, result.ok ? 0 : 2);
