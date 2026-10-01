import { I01_TERMS_VERSION_RE } from "./constants.mjs";

export function isI01TermsVersion(value) {
  return typeof value === "string" && I01_TERMS_VERSION_RE.test(value);
}

export function isIntegerTermsVersion(value) {
  if (typeof value === "number") return Number.isInteger(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return true;
  return false;
}
