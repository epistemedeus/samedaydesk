import { readFileSync } from "node:fs";
import { USEFUL_JOBS_CATALOG_PATH, loadPins } from "./pins.mjs";

const FLAG_RE = /^--[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function loadCatalog(catalogPath = USEFUL_JOBS_CATALOG_PATH) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (catalog.schema !== "useful-jobs.catalog.v1") {
    throw new Error(`unexpected catalog schema ${catalog.schema}`);
  }
  return catalog;
}

export function jobById(catalog, engineId) {
  return (catalog.jobs || []).find((job) => job.id === engineId) || null;
}

export function requiredFlags(job) {
  return [...(job.requiredInputs || [])];
}

export function optionalFlags(job) {
  return [...(job.optionalInputs || [])];
}

export function allowedFlags(job) {
  return [...requiredFlags(job), ...optionalFlags(job)];
}

export function flagToKey(flag) {
  const name = String(flag || "").replace(/^--/, "");
  return name;
}

export function isReferencedCaptureFlag(value) {
  return /^--job-(before|after)$/.test(String(value || ""));
}

export function isFlag(value) {
  return FLAG_RE.test(String(value || "")) || isReferencedCaptureFlag(value);
}

export function loadPinnedRuntime() {
  const pins = loadPins();
  const catalog = loadCatalog(pins.catalogPath);
  return { pins, catalog };
}
