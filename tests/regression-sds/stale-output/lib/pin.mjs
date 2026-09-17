import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE, REPO_ROOT, WRITE_BOUNDARY } from "./root.mjs";

const KIT_REL = "client/src/data/usefulJobsKit.json";
const SHA_DIR_REL = "client/public/for-agents/useful-jobs";

function readJson(rel) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    const err = new Error(`missing pin cite ${rel}`);
    err.code = "PIN_MISSING";
    throw err;
  }
  return { abs, rel, data: JSON.parse(readFileSync(abs, "utf8")) };
}

function shaRel(version) {
  return `${SHA_DIR_REL}/useful-jobs-${version}.sha256.json`;
}

function asPin(source, data) {
  const version = data.version || (typeof data.name === "string" ? data.name.replace(/^useful-jobs-/, "") : null);
  const sha256 = data.sha256 || data.archive?.sha256 || null;
  const bytes = data.bytes ?? data.archive?.bytes ?? null;
  if (!version || typeof sha256 !== "string" || typeof bytes !== "number") {
    const err = new Error(`unreadable pin from ${source}`);
    err.code = "PIN_INVALID";
    throw err;
  }
  return {
    version,
    sha256: sha256.toLowerCase(),
    bytes,
    rootName: data.rootName || data.name || `useful-jobs-${version}`,
    builtAt: data.builtAt || null,
    source,
  };
}

function assertSamePin(a, b, code) {
  if (a.version !== b.version || a.sha256 !== b.sha256 || a.bytes !== b.bytes) {
    const err = new Error(
      `pin drift ${a.source} (${a.version}/${a.sha256}/${a.bytes}) vs ${b.source} (${b.version}/${b.sha256}/${b.bytes})`,
    );
    err.code = code;
    throw err;
  }
}

/** Live current pin from shipped kit + matching sha256.json. Fail closed on drift. */
export function loadCurrentPin() {
  const kit = readJson(KIT_REL);
  const fromKit = asPin(KIT_REL, kit.data);
  const shaFile = readJson(shaRel(fromKit.version));
  const fromSha = asPin(shaFile.rel, shaFile.data);
  assertSamePin(fromKit, fromSha, "PIN_DRIFT");
  return Object.freeze({
    ...fromKit,
    builtAt: fromSha.builtAt || fromKit.builtAt,
    kitPath: kit.abs,
    sha256Path: shaFile.abs,
  });
}

export function loadStalePin(version) {
  const shaFile = readJson(shaRel(version));
  return Object.freeze(asPin(shaFile.rel, shaFile.data));
}

export function loadHistoricalPins(current = loadCurrentPin()) {
  const kit = readJson(KIT_REL).data;
  const versions = new Set();
  if (kit.previous?.version) versions.add(kit.previous.version);
  for (const row of kit.immutableArchives || []) {
    if (row.version) versions.add(row.version);
  }
  versions.delete(current.version);
  const out = {};
  for (const version of versions) {
    out[version] = loadStalePin(version);
  }
  return Object.freeze(out);
}

export const CURRENT_PIN = loadCurrentPin();
export const STALE_PINS = loadHistoricalPins(CURRENT_PIN);

export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  write: WRITE_BOUNDARY,
});

export { FEATURE };

export function knownStaleSha(sha) {
  if (!sha) return false;
  return Object.values(STALE_PINS).some((pin) => pin.sha256 === sha);
}

export function pinForSha(sha) {
  if (!sha) return null;
  if (sha === CURRENT_PIN.sha256) return CURRENT_PIN;
  return Object.values(STALE_PINS).find((pin) => pin.sha256 === sha) || null;
}
