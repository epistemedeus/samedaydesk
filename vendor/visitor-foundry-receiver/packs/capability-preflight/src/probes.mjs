/**
 * Explicit local probes only — never silent network/model/paid calls.
 * Caller must pass probe:true / CLI --probe to observe filesystem/runtime facts.
 *
 * Engine matching requires the entire supported syntax (`>=N` or `>=N.M`).
 * Unsupported ranges stay unknown rather than being prefix-interpreted.
 */
import { existsSync, statSync, accessSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Whole-string supported forms only: ">=22" or ">=22.0". */
const SUPPORTED_ENGINE_RANGE = /^>=\s*(\d+)(?:\.(\d+))?\s*$/;

/**
 * @returns {boolean|null} true/false when the whole range is supported; null if unknown/unsupported
 */
export function satisfiesEnginesNode(range, version) {
  if (typeof range !== "string" || !range.trim()) return null;
  const m = range.trim().match(SUPPORTED_ENGINE_RANGE);
  if (!m) return null;
  const needMajor = Number(m[1]);
  const needMinor = m[2] != null ? Number(m[2]) : 0;
  const [maj, min] = String(version)
    .replace(/^v/, "")
    .split(".")
    .map((x) => Number(x));
  if (!Number.isFinite(maj)) return null;
  if (maj > needMajor) return true;
  if (maj < needMajor) return false;
  return (Number.isFinite(min) ? min : 0) >= needMinor;
}

export function isReadableRegularFile(abs) {
  if (typeof abs !== "string" || !abs) return false;
  try {
    if (!existsSync(abs)) return false;
    const st = statSync(abs);
    if (!st.isFile()) return false;
    accessSync(abs, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function observeBin(packageRoot, binField, packageName) {
  const binExists = [];
  const binRejected = [];
  const push = (name, abs, declared) => {
    if (isReadableRegularFile(abs)) {
      binExists.push(name);
      return;
    }
    let reason = "missing";
    try {
      if (existsSync(abs) && !statSync(abs).isFile()) reason = "not_regular_file";
    } catch {
      reason = "unreadable";
    }
    binRejected.push({ name, declared, reason });
  };

  if (typeof binField === "string" && binField.trim()) {
    const name = String(packageName || "bin");
    const abs = isAbsolute(binField) ? binField : join(packageRoot, binField);
    push(name, abs, binField);
  } else if (binField && typeof binField === "object" && !Array.isArray(binField)) {
    for (const [name, rel] of Object.entries(binField)) {
      const abs = isAbsolute(String(rel)) ? String(rel) : join(packageRoot, String(rel));
      push(name, abs, rel);
    }
  }
  return { binExists, binRejected };
}

/**
 * @param {object} opts
 * @param {boolean} opts.probe - must be true to run; otherwise returns {invoked:false}
 * @param {object} [opts.manifest]
 * @param {string} [opts.packageRoot] - directory to resolve bin/entrypoint relative paths
 */
export function runLocalProbes(opts = {}) {
  if (opts.probe !== true) {
    return {
      invoked: false,
      note: "Local probes not invoked. Pass probe:true or CLI --probe. Missing probe evidence is unknown, not false.",
      observations: null,
    };
  }

  const manifest = opts.manifest && typeof opts.manifest === "object" ? opts.manifest : {};
  const packageRoot = opts.packageRoot || dirname(fileURLToPath(import.meta.url));

  const nodeVersion = process.versions.node;
  const enginesNode = manifest.engines?.node;
  let nodeVersionSatisfies = null;
  let nodeEngineRangeSupported = null;
  if (enginesNode != null && enginesNode !== "") {
    nodeEngineRangeSupported = SUPPORTED_ENGINE_RANGE.test(String(enginesNode).trim());
    nodeVersionSatisfies = satisfiesEnginesNode(String(enginesNode), nodeVersion);
  }

  const { binExists, binRejected } = observeBin(packageRoot, manifest.bin, manifest.name);

  let entrypointExists = null;
  if (manifest.entrypoint) {
    const abs = isAbsolute(String(manifest.entrypoint))
      ? String(manifest.entrypoint)
      : join(packageRoot, String(manifest.entrypoint));
    entrypointExists = isReadableRegularFile(abs);
  }

  if (Array.isArray(opts.binNames)) {
    for (const _name of opts.binNames) {
      // caller-supplied name list alone is not observation — only filesystem hits count
    }
  }

  return {
    invoked: true,
    note: "Caller-invoked local filesystem/runtime observations only. Not remote attestation.",
    observations: {
      nodeVersionSatisfies,
      nodeEngineRange: enginesNode ?? null,
      nodeEngineRangeSupported,
      binExists,
      binRejected,
      entrypointExists,
      runtime: {
        node: nodeVersion,
        platform: process.platform,
      },
    },
    unknownWhenMissing: true,
  };
}

/**
 * Merge local observations with caller declarations.
 * When local evaluation is inconclusive, caller true/false is retained only
 * under callerDeclared — it does not populate the resolver fields.
 */
export function buildProbeForResolve(probeResult, callerProbe = {}) {
  const caller =
    callerProbe && typeof callerProbe === "object" && !Array.isArray(callerProbe)
      ? { ...callerProbe }
      : {};

  if (!probeResult?.invoked) {
    return {
      ...caller,
      callerDeclared: { ...caller },
      provenance: {
        localInvoked: false,
        nodeVersionSatisfies: caller.nodeVersionSatisfies != null ? "caller_declared" : "absent",
        binExists: Array.isArray(caller.binExists) ? "caller_declared" : "absent",
        entrypointExists: caller.entrypointExists != null ? "caller_declared" : "absent",
      },
    };
  }

  const o = probeResult.observations || {};
  const out = {
    callerDeclared: { ...caller },
    provenance: {
      localInvoked: true,
      nodeVersionSatisfies: "absent",
      binExists: "local",
      entrypointExists: "absent",
    },
  };

  if (o.nodeVersionSatisfies === true || o.nodeVersionSatisfies === false) {
    out.nodeVersionSatisfies = o.nodeVersionSatisfies;
    out.provenance.nodeVersionSatisfies = "local";
  } else {
    out.provenance.nodeVersionSatisfies = "local_unknown";
    out.provenance.callerDeclaredNodeVersionSatisfies = caller.nodeVersionSatisfies ?? null;
  }

  if (Array.isArray(o.binExists)) {
    out.binExists = o.binExists;
    out.provenance.binExists = "local";
  }
  if (Array.isArray(o.binRejected) && o.binRejected.length) {
    out.binRejected = o.binRejected;
  }

  if (o.entrypointExists === true || o.entrypointExists === false) {
    out.entrypointExists = o.entrypointExists;
    out.provenance.entrypointExists = "local";
  } else {
    out.provenance.entrypointExists =
      o.entrypointExists === null ? "local_not_measured" : "absent";
  }

  if (o.runtime) out.runtime = o.runtime;
  if (o.nodeEngineRange != null) out.nodeEngineRange = o.nodeEngineRange;
  if (o.nodeEngineRangeSupported != null) out.nodeEngineRangeSupported = o.nodeEngineRangeSupported;

  return out;
}

void require;
