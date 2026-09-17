#!/usr/bin/env node
import { DATA_ROOT, loadPin } from "../lib/paths.mjs";
import { ingestFile } from "../lib/ingest.mjs";
import { invalidateById, refuseRepublication } from "../lib/invalidate.mjs";
import { loadJson, loadStore, validateStore, versionsIndex } from "../lib/store.mjs";
import { validateRecord } from "../lib/validate.mjs";
import { verify, seededFailurePrivateTerms } from "../lib/verify.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `work-terms-dataset - maintained public work-terms with versions, invalidation, attribution

Commands:
  verify                         Validate dataset, prove invalidation, reject private scrape
  validate                       Validate committed catalog + records
  catalog                        Print catalog coverage (non-universal)
  versions                       Print version index
  current --platform <id> [--kind <kind>]
  ingest --file <json> [--write] Ingest operator-supplied public metadata
  invalidate --id <id> --reason <reason> --note <text> [--write]
  republication --id <id>        Show republication rights for a record
  seeded-failure                 Run the private-terms scrape refusal
  pin                            Print pack pin

This pack does not scrape. Private terms are refused. Coverage is named-source only.
Disjoint from H04 licensed regression packs.
`;
}

function write(value, code) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (!cmd || cmd === "help" || args.help) {
  process.stdout.write(usage());
  process.exit(0);
}

const root = typeof args.root === "string" ? args.root : DATA_ROOT;

if (cmd === "pin") {
  write(loadPin(), 0);
}

if (cmd === "verify") {
  const report = verify(root === DATA_ROOT ? undefined : root);
  write(report, report.ok ? 0 : 1);
}

if (cmd === "validate") {
  const store = loadStore(root);
  const result = validateStore(store);
  write(
    {
      ok: result.ok,
      errors: result.errors,
      records: store.records.length,
      current: store.records.filter((item) => item.record.status === "current").length,
    },
    result.ok ? 0 : 1,
  );
}

if (cmd === "catalog") {
  const store = loadStore(root);
  write(
    {
      ok: store.catalog.coverage.universal === false,
      coverage: store.catalog.coverage,
      platforms: store.catalog.platforms,
      coverageGaps: store.catalog.coverageGaps,
      disjointFrom: store.catalog.disjointFrom,
      liveScrape: store.catalog.liveScrape,
    },
    store.catalog.coverage.universal === false ? 0 : 1,
  );
}

if (cmd === "versions") {
  const store = loadStore(root);
  write(versionsIndex(store), 0);
}

if (cmd === "current") {
  const store = loadStore(root);
  const platform = args.platform;
  const kind = args.kind;
  if (!platform) write({ ok: false, code: "invalid_shape", message: "--platform required" }, 2);
  const records = store.records
    .filter(
      (item) =>
        item.record.platformId === platform &&
        item.record.status === "current" &&
        (!kind || item.record.documentKind === kind),
    )
    .map((item) => ({
      id: item.record.id,
      documentKind: item.record.documentKind,
      version: item.record.version,
      republication: item.record.republication,
      attribution: item.record.attribution,
    }));
  write({ ok: true, platform, kind: kind || null, records }, 0);
}

if (cmd === "ingest") {
  if (typeof args.file !== "string") write({ ok: false, code: "invalid_shape", message: "--file required" }, 2);
  const result = ingestFile(root, args.file, { write: args.write === true });
  write(result, result.ok ? 0 : 1);
}

if (cmd === "invalidate") {
  if (typeof args.id !== "string" || typeof args.reason !== "string" || typeof args.note !== "string") {
    write({ ok: false, code: "invalid_shape", message: "--id --reason --note required" }, 2);
  }
  const result = invalidateById(root, args.id, {
    reason: args.reason,
    note: args.note,
    write: args.write === true,
    actor: "operator",
  });
  write(result, result.ok ? 0 : 1);
}

if (cmd === "republication") {
  if (typeof args.id !== "string") write({ ok: false, code: "invalid_shape", message: "--id required" }, 2);
  const store = loadStore(root);
  const item = store.records.find((row) => row.record.id === args.id);
  if (!item) write({ ok: false, code: "unknown_record", message: `no record ${args.id}` }, 1);
  write(
    {
      id: item.record.id,
      status: item.record.status,
      version: item.record.version,
      attribution: item.record.attribution,
      republication: item.record.republication,
      reuse: refuseRepublication(item.record),
    },
    0,
  );
}

if (cmd === "seeded-failure") {
  const result = seededFailurePrivateTerms();
  write(
    {
      ok: result.rejected,
      seededFailure: "private-terms-scrape",
      accepted: result.accepted,
      rejected: result.rejected,
      code: result.code,
      message: result.message,
    },
    result.rejected ? 0 : 1,
  );
}

if (cmd === "check-file") {
  if (typeof args.file !== "string") write({ ok: false, message: "--file required" }, 2);
  const record = loadJson(args.file);
  const result = validateRecord(record);
  write(result, result.ok ? 0 : 1);
}

process.stderr.write(`unknown command ${cmd}\n${usage()}`);
process.exit(2);
