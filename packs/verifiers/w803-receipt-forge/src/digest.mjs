import { createHash } from "node:crypto";
import { FORBIDDEN_KEYS } from "./constants.mjs";

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of ownKeys(value).sort()) {
      if (FORBIDDEN_KEYS.includes(key)) continue;
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export function claimBody(claim) {
  if (!isPlainObject(claim)) return claim;
  const body = {};
  for (const key of ownKeys(claim)) {
    if (key === "integrity") continue;
    if (FORBIDDEN_KEYS.includes(key)) continue;
    body[key] = claim[key];
  }
  return body;
}

export function canonicalBytes(claim) {
  return JSON.stringify(canonicalize(claimBody(claim)));
}

export function digestHex(claim) {
  return createHash("sha256").update(canonicalBytes(claim), "utf8").digest("hex");
}

export function digestClaim(claim) {
  return `sha256:${digestHex(claim)}`;
}

export function stampIntegrity(claim) {
  const next = structuredClone(claim);
  delete next.integrity;
  next.integrity = {
    alg: "sha256",
    claimedDigest: digestClaim(next),
  };
  return next;
}
