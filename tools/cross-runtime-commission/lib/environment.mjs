/**
 * F11/B03 contract import: exact environment fingerprints.
 * independent:true only when comparable runtimes differ by more than cwd.
 */
import { stableStringify } from "./digest.mjs";

export const KIND_SPECS = Object.freeze({
  local: Object.freeze({
    kind: "local",
    isolation: "host-process",
    hostname: "crc-node22-local",
    containerId: null,
  }),
  "container-fixture": Object.freeze({
    kind: "container-fixture",
    isolation: "container-process-fixture",
    hostname: "crc-node22-container-fixture",
    containerId: "fixture-node22-container",
  }),
});

/** Recorded but ignored when deciding independence. */
export const INDEPENDENCE_IGNORE = Object.freeze([
  "cwd",
  "outDir",
  "inputPath",
  "pid",
  "startedAt",
  "tmpRoot",
  "label",
]);

export function resolveKind(kind) {
  const key = kind || "local";
  if (!KIND_SPECS[key]) {
    const err = new Error(`unknown runtime kind ${key}`);
    err.code = "unknown-runtime-kind";
    throw err;
  }
  return KIND_SPECS[key];
}

export function captureEnvironment({ label, kind, cwd, outDir, inputPath }) {
  const spec = resolveKind(kind);
  const nodeMajor = Number(String(process.versions.node).split(".")[0]);
  return {
    label,
    kind: spec.kind,
    isolation: spec.isolation,
    hostname: spec.hostname,
    containerId: spec.containerId,
    node: process.version,
    nodeMajor,
    platform: process.platform,
    arch: process.arch,
    cwd,
    outDir: outDir || null,
    inputPath: inputPath || null,
  };
}

export function fingerprintForIndependence(environment) {
  const out = {};
  for (const [key, value] of Object.entries(environment || {})) {
    if (INDEPENDENCE_IGNORE.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

export function environmentsDifferByMoreThanCwd(environments) {
  if (!Array.isArray(environments) || environments.length < 2) {
    return {
      independent: false,
      reason: "fewer-than-two-runtimes",
    };
  }
  const prints = environments.map((env) => stableStringify(fingerprintForIndependence(env)));
  const unique = new Set(prints);
  if (unique.size < 2) {
    return {
      independent: false,
      reason: "environments-differ-only-by-cwd-or-are-identical",
    };
  }
  return {
    independent: true,
    reason: "environments-differ-by-more-than-cwd",
  };
}

export function childEnvForRuntime(spec, label) {
  const resolved = typeof spec === "string" ? resolveKind(spec) : spec;
  return {
    SDS_CRC_LABEL: label,
    SDS_CRC_KIND: resolved.kind,
    SDS_CRC_ISOLATION: resolved.isolation,
    SDS_CRC_HOSTNAME: resolved.hostname,
    ...(resolved.containerId ? { SDS_CRC_CONTAINER_ID: resolved.containerId } : {}),
  };
}
