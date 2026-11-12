import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const catalogBytes = readFileSync(new URL("./settlement-unit-catalog.json", import.meta.url));

export const CHECKED_CATALOG_BLOB = createHash("sha1").update(`blob ${catalogBytes.length}\0`).update(catalogBytes).digest("hex");
export const CHECKED_CATALOG = JSON.parse(catalogBytes.toString("utf8"));

function checkedEntry() {
  const entries = CHECKED_CATALOG.entries;
  if (!Array.isArray(entries) || entries.length !== 1) return null;
  const entry = entries[0];
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.network !== "string" || typeof entry.asset !== "string") return null;
  if (typeof entry.symbol !== "string" || !Number.isInteger(entry.decimals)) return null;
  return entry;
}

export function isCheckedPair(unit) {
  const entry = checkedEntry();
  if (!entry || !unit || typeof unit !== "object" || typeof unit.asset !== "string") return false;
  return unit.network === entry.network && unit.asset.toLowerCase() === entry.asset.toLowerCase();
}

export function matchesCheckedUnit(unit) {
  const entry = checkedEntry();
  if (!entry || !isCheckedPair(unit)) return false;
  return unit.asset === entry.asset && unit.symbol === entry.symbol && unit.decimals === entry.decimals;
}

const CATALOG_CLAIM_KEYS = Object.freeze(["checkedAt", "schemaVersion", "usableEntries"]);

export function matchesCheckedCatalogClaim(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return false;
  const keys = Object.keys(catalog).sort();
  if (keys.length !== CATALOG_CLAIM_KEYS.length || keys.some((key, index) => key !== CATALOG_CLAIM_KEYS[index])) return false;
  return catalog.schemaVersion === CHECKED_CATALOG.schemaVersion
    && catalog.checkedAt === CHECKED_CATALOG.checkedAt
    && catalog.usableEntries === 1;
}
