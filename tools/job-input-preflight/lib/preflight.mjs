import fs from "node:fs";
import path from "node:path";
import { CATALOG_SCHEMA, MAX_LOCAL_INPUT_BYTES, PREFLIGHT_RESULT_NAME } from "./constants.mjs";
import { declaredIdentity, formatDigest } from "./digest.mjs";
import { createNullEngineAdapter, LATER_ENGINE_BINDING } from "./engine-adapter.mjs";
import { flagToKey, readBoundedRegularFile, resolveInputPath } from "./paths.mjs";
import { refuse } from "./refuse.mjs";

function loadDeclaredInputs(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        return loadDeclaredInputs(JSON.parse(trimmed));
      } catch (err) {
        throw refuse("invalid-declared-inputs", "declared-inputs inline JSON is invalid", {
          error: String(err?.message || err),
        });
      }
    }
    let json;
    try {
      json = JSON.parse(fs.readFileSync(raw, "utf8"));
    } catch (err) {
      throw refuse("invalid-declared-inputs", "declared-inputs is not valid JSON", {
        path: raw,
        error: String(err?.message || err),
      });
    }
    return loadDeclaredInputs(json);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw refuse("invalid-declared-inputs", "declared-inputs must be a JSON object");
  }
  return raw;
}

function maybeParseJsonFile(file) {
  if (!file.path.endsWith(".json") && !file.path.endsWith(".jsonl")) return { json: false };
  try {
    const text = file.buffer.toString("utf8");
    JSON.parse(text);
    return { json: true };
  } catch (err) {
    throw refuse("input-malformed-json", "JSON input is not valid JSON", {
      path: file.path,
      error: String(err?.message || err),
    });
  }
}

/**
 * Preflight caller files against catalog requiredInputs.
 * Never invokes the job engine. No spend or tool-cost claims.
 */
export function preflight(options) {
  const engineAdapter = options.engineAdapter || createNullEngineAdapter();
  const catalog = options.catalog;
  const job = options.job;
  if (!catalog || catalog.schema !== CATALOG_SCHEMA) {
    throw refuse("catalog-schema-mismatch", "preflight requires a parsed useful-jobs catalog");
  }
  if (!job) throw refuse("unknown-job", "preflight requires a catalog job");

  if (options.example === true || options.example === "true") {
    throw refuse(
      "example-not-preflight",
      "preflight does not substitute --example samples or run the engine; pass caller files",
    );
  }

  const flags = options.flags && typeof options.flags === "object" ? options.flags : {};
  const requiredKeys = job.requiredInputs.map(flagToKey);
  const missing = requiredKeys.filter((k) => {
    const v = flags[k];
    return v == null || v === false || v === "";
  });
  if (missing.length) {
    throw refuse(
      "missing-required-inputs",
      `Caller mode requires ${job.requiredInputs.join(", ")}`,
      { missing, required: requiredKeys },
    );
  }

  const declared = loadDeclaredInputs(options.declaredInputs);
  const inputRoot = options.inputRoot ? path.resolve(String(options.inputRoot)) : null;
  const optionalKeys = (job.optionalInputs || []).map(flagToKey);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);

  const fileKeys = [...new Set([...requiredKeys, ...Object.keys(flags).filter((k) => allowed.has(k))])].filter(
    (k) => k !== "input-root" && k !== "example",
  );

  const inputs = {};
  for (const key of fileKeys) {
    const declaredPath = flags[key];
    if (declaredPath == null || declaredPath === false || declaredPath === "") continue;
    const abs = resolveInputPath(String(declaredPath), { inputRoot });
    const actual = readBoundedRegularFile(abs, { inputRoot });
    const slotDeclared = declared[key] || {};
    const identity = declaredIdentity({
      digest: flags[`${key}-digest`] ?? slotDeclared.digest,
      sha256: flags[`${key}-sha256`] ?? slotDeclared.sha256,
      bytes: flags[`${key}-bytes`] ?? slotDeclared.bytes,
    });
    maybeParseJsonFile(actual);

    if (identity.digestHex && identity.digestHex !== actual.sha256) {
      throw refuse("input-digest-mismatch", "Declared digest does not match local file bytes", {
        key,
        path: actual.path,
        declaredDigest: formatDigest(identity.digestHex),
        actualDigest: formatDigest(actual.sha256),
        declaredBytes: identity.bytes,
        actualBytes: actual.bytes,
      });
    }
    if (identity.bytes != null && Number(identity.bytes) !== actual.bytes) {
      throw refuse("input-digest-mismatch", "Declared digest/bytes do not match local file bytes", {
        key,
        path: actual.path,
        declaredBytes: identity.bytes,
        actualBytes: actual.bytes,
        actualDigest: formatDigest(actual.sha256),
      });
    }

    inputs[key] = {
      flag: `--${key}`,
      path: actual.path,
      bytes: actual.bytes,
      sha256: actual.sha256,
      digest: formatDigest(actual.sha256),
      json: actual.path.endsWith(".json"),
    };
  }

  // Never call the engine. Record that the adapter stayed unused.
  if (typeof engineAdapter.invoke !== "function") {
    throw refuse("invalid-engine-adapter", "engine adapter is missing invoke()");
  }

  const result = {
    ok: true,
    refused: false,
    job: job.id,
    catalogSchema: catalog.schema,
    catalogPackage: catalog.package ?? null,
    catalogVersion: catalog.version ?? null,
    requiredInputs: job.requiredInputs,
    optionalInputs: job.optionalInputs || [],
    engineOutputs: job.outputs || [],
    engineInvoked: false,
    engineAdapter: engineAdapter.name || "null-not-invoked",
    laterEngineBinding: LATER_ENGINE_BINDING,
    purchaseAuthority: false,
    spendClaim: false,
    toolCostClaim: false,
    preSpendSavingsClaim: false,
    limitBytes: MAX_LOCAL_INPUT_BYTES,
    inputRoot,
    inputs,
  };

  if (options.outDir) {
    const outDir = path.resolve(String(options.outDir));
    result.outDir = outDir;
    result.written = [PREFLIGHT_RESULT_NAME];
    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, PREFLIGHT_RESULT_NAME);
    fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}
