#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  listJsonFiles,
  loadCatalog,
  loadJson,
  settlementFixtureDir,
  validateRecord,
} from "../evidence-records/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_PATH = join(here, "golden/banked-settlement-table.json");
export const BUYER_CLASSES = Object.freeze(["independent", "owner", "sponsored", "unknown"]);
export const CITED_BANKED_USDC = "8.105";
const USDC_SCALE = 1_000_000n;
const DECIMAL_RE = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const PROHIBITED_CODES = new Set([
  "cross_source_join_without_exact_key",
  "sum_across_authority_classes",
  "organic_label_for_controlled_or_incentivized_traffic",
  "collapsed_provider_scope",
  "analytics_count_is_independent_demand",
  "search_impression_is_visit",
  "indexnow_receipt_is_indexing",
  "catalog_presence_is_demand",
  "provider_response_is_chain_settlement",
  "chain_transfer_is_route_attribution",
  "stripe_event_is_onchain_settlement",
  "local_observation_is_provider_billing",
]);

export function parseUsdc(value) {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    throw new Error(`invalid USDC amount: ${value}`);
  }
  const [whole, frac = ""] = value.split(".");
  const extra = frac.slice(6);
  if (/[1-9]/.test(extra)) {
    throw new Error(`USDC amount has more than 6 decimals: ${value}`);
  }
  const frac6 = `${frac}000000`.slice(0, 6);
  return BigInt(whole) * USDC_SCALE + BigInt(frac6);
}

export function formatUsdc(atomic) {
  const negative = atomic < 0n;
  const abs = negative ? -atomic : atomic;
  const whole = abs / USDC_SCALE;
  const frac = abs % USDC_SCALE;
  const milli = frac / 1000n;
  return `${negative ? "-" : ""}${whole}.${String(milli).padStart(3, "0")}`;
}

export function loadSettlementRecords(dir = settlementFixtureDir()) {
  return listJsonFiles(dir).map((filePath) => ({ filePath, record: loadJson(filePath) }));
}

function prohibitedErrors(errors) {
  return errors.filter((item) => PROHIBITED_CODES.has(item.code));
}

export function classifyRecord(record, catalog) {
  const completenessPresent = Object.hasOwn(record, "completeness");
  const toValidate = completenessPresent ? record : { ...record, completeness: "unknown" };
  const result = validateRecord(toValidate, catalog);
  const prohibited = prohibitedErrors(result.errors);
  if (prohibited.length > 0) {
    return { ok: false, errors: result.errors };
  }
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  const settlement = record.settlement && typeof record.settlement === "object" ? record.settlement : {};
  const amountUsdc = typeof settlement.amountUsdc === "string" ? settlement.amountUsdc : "0";
  const operationId =
    typeof settlement.operationId === "string" ? settlement.operationId : record.recordId;
  const validDeliveryStatus =
    typeof settlement.validDeliveryStatus === "string" ? settlement.validDeliveryStatus : "unknown";
  const declaredClass = settlement.buyerClass;
  const buyerClass =
    completenessPresent && catalog.buyerClasses.includes(declaredClass) ? declaredClass : "unknown";

  return {
    ok: true,
    errors: [],
    row: {
      operationId,
      usdc: formatUsdc(parseUsdc(amountUsdc)),
      buyerClass,
      validDeliveryStatus,
    },
  };
}

export function buildTable(rows, citedBankedUsdc = CITED_BANKED_USDC) {
  const buckets = Object.fromEntries(BUYER_CLASSES.map((name) => [name, []]));
  for (const row of rows) {
    const buyerClass = BUYER_CLASSES.includes(row.buyerClass) ? row.buyerClass : "unknown";
    buckets[buyerClass].push(row);
  }

  const tableRows = BUYER_CLASSES.map((buyerClass) => {
    const operations = buckets[buyerClass]
      .slice()
      .sort((a, b) => a.operationId.localeCompare(b.operationId))
      .map((item) => ({
        operationId: item.operationId,
        usdc: item.usdc,
        validDeliveryStatus: item.validDeliveryStatus,
      }));
    const atomic = operations.reduce((sum, item) => sum + parseUsdc(item.usdc), 0n);
    return {
      buyerClass,
      count: operations.length,
      usdc: formatUsdc(atomic),
      operations,
      validDeliveryStatus: operations.map((item) => item.validDeliveryStatus),
    };
  });

  const computedAtomic = tableRows.reduce((sum, row) => sum + parseUsdc(row.usdc), 0n);
  const citedAtomic = parseUsdc(citedBankedUsdc);
  return {
    citedBankedUsdc: formatUsdc(citedAtomic),
    computedUsdc: formatUsdc(computedAtomic),
    differenceUsdc: formatUsdc(computedAtomic - citedAtomic),
    rows: tableRows,
  };
}

export function formatMarkdown(table) {
  const lines = [
    "| buyerClass | count | usdc | operations | validDeliveryStatus |",
    "| --- | ---: | ---: | --- | --- |",
  ];
  for (const row of table.rows) {
    const operations = row.operations.map((item) => item.operationId).join(", ") || "—";
    const delivery = row.validDeliveryStatus.join(", ") || "—";
    lines.push(`| ${row.buyerClass} | ${row.count} | ${row.usdc} | ${operations} | ${delivery} |`);
  }
  lines.push("");
  lines.push(
    `cited ${table.citedBankedUsdc}; computed ${table.computedUsdc}; difference ${table.differenceUsdc}`,
  );
  return `${lines.join("\n")}\n`;
}

export function reconcileRecords(records, catalog = loadCatalog(), citedBankedUsdc = CITED_BANKED_USDC) {
  const classified = [];
  const rejected = [];
  for (const record of records) {
    const result = classifyRecord(record, catalog);
    if (!result.ok) {
      rejected.push({
        recordId: typeof record?.recordId === "string" ? record.recordId : null,
        errors: result.errors,
      });
      continue;
    }
    classified.push(result.row);
  }
  if (rejected.length > 0) {
    return { ok: false, rejected, table: null };
  }
  return { ok: true, rejected: [], table: buildTable(classified, citedBankedUsdc) };
}

export function reconcileDir(dir = settlementFixtureDir(), catalog = loadCatalog()) {
  const loaded = loadSettlementRecords(dir);
  return reconcileRecords(
    loaded.map((item) => item.record),
    catalog,
  );
}

function isMain() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      pretty: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(`Reconcile banked settlement observations from typed evidence records.

Usage:
  node tools/evidence/reconcile.mjs
  node tools/evidence/reconcile.mjs --dir tools/evidence-records/fixtures/settlements

Reads only settlement records. Emits per-buyerClass count, USDC, operations,
and valid-delivery status, plus an unknown row. Compares the computed total
to the cited banked amount and reports the exact difference.
`);
    process.exit(0);
  }
  const report = reconcileDir(values.dir);
  const indent = values.pretty ? 2 : 0;
  if (!report.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, rejected: report.rejected }, null, indent)}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, table: report.table, markdown: formatMarkdown(report.table) }, null, indent)}\n`,
  );
  process.exit(0);
}
