import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_LEDGER } from "./pins.mjs";

export function emptyLedger() {
  return {
    schema: SCHEMA_LEDGER,
    independentDemand: false,
    organicDemand: false,
    jobRevenueUsdc: null,
    citedBankedUsdcIsNotJobRevenue: true,
    rows: [],
  };
}

export function loadLedger(filePath) {
  if (!filePath || !existsSync(filePath)) return emptyLedger();
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) {
    throw new Error(`invalid ledger file: ${filePath}`);
  }
  return parsed;
}

export function saveLedger(filePath, ledger) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

export function appendRow(filePath, row) {
  const ledger = loadLedger(filePath);
  ledger.rows.push(row);
  ledger.independentDemand = false;
  ledger.organicDemand = false;
  ledger.jobRevenueUsdc = null;
  ledger.citedBankedUsdcIsNotJobRevenue = true;
  return saveLedger(filePath, ledger);
}
