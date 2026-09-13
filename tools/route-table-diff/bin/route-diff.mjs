#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runRouteDiff, toPublicError } from "../lib/index.mjs";

let values;
try {
  ({ values } = parseArgs({
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: "boolean", default: false },
      before: { type: "string" },
      after: { type: "string" },
      "out-dir": { type: "string" },
      example: { type: "boolean", default: false },
      published: { type: "boolean", default: false },
      "rewrite-homepage": { type: "boolean", default: false },
    },
  }));
} catch (err) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      refused: true,
      code: "invalid_args",
      error: err instanceof Error ? err.message : String(err),
      detail: null,
    })}\n`,
  );
  process.exit(2);
}

if (values.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

if (!values["out-dir"]) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      refused: true,
      code: "missing_out_dir",
      error: "--out-dir is required to write route-diff.json and route-diff.md",
      detail: null,
    })}\n`,
  );
  process.exit(2);
}

try {
  const result = await runRouteDiff({
    before: values.before,
    after: values.after,
    outDir: values["out-dir"],
    example: values.example,
    published: values.published,
    rewriteHomepage: values["rewrite-homepage"],
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      schema: result.schema,
      publishedRouteTable: result.publishedRouteTable,
      sample: result.sample,
      evidenceClass: result.evidenceClass,
      counts: result.counts,
      tableDigest: result.tableDigest,
      outDir: result.outDir || null,
      outputs: result.outputs || null,
      added: result.added.map((route) => route.path),
      changed: result.changed.map((item) => ({ path: item.path, fields: item.fields })),
    })}\n`,
  );
} catch (err) {
  process.stdout.write(`${JSON.stringify(toPublicError(err))}\n`);
  process.exit(err.exitCode || 2);
}

function usage() {
  return `SPA route-table diff (offline).

Read two JSON route catalogs {path, canonical, title, robots?} and write
route-diff.json / route-diff.md (added, removed, changed canonical or robots).

  node tools/route-table-diff/bin/route-diff.mjs --before <file-or-loopback-url> --after <file-or-loopback-url> --out-dir <dir>
  node tools/route-table-diff/bin/route-diff.mjs --example --out-dir <dir>

Does not edit spa-route-shells.js, homepages, or live listings.
Does not fetch public hosts. Loopback http://127.0.0.1 is local-runtime, not external acceptance.
SAMPLE / --example is a fixture, not the published route table.
--published with SAMPLE is refused. --rewrite-homepage is refused.
Path-less records are refused.

Node >= 22. No extra npm packages. Payments: none (nonsettling prototype; paid=false).`;
}
