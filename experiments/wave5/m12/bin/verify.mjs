#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describeSelectedOffer } from "../lib/describe.mjs";
import { loadSources } from "../lib/sources.mjs";
import { verifyOfferDescription } from "../lib/verify.mjs";

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

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  process.stdout.write(
    "Usage: node experiments/wave5/m12/bin/verify.mjs [--description file.json] [--out file.json]\n",
  );
  process.exit(0);
}

const sources = await loadSources();
const description = args.description
  ? JSON.parse(readFileSync(resolve(String(args.description)), "utf8"))
  : describeSelectedOffer(sources);
const report = await verifyOfferDescription(description, sources);
const text = `${JSON.stringify(report, null, 2)}\n`;
if (args.out) writeFileSync(resolve(String(args.out)), text);
process.stdout.write(text);
process.exit(report.ok ? 0 : 2);
