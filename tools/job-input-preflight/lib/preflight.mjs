import fs from "node:fs";
import path from "node:path";
import {
  CATALOG_SCHEMA,
  EXECUTION_CONTRACT_VERSION,
  EXECUTION_MAX_INPUT_BYTES,
  KIT_MAX_LOCAL_INPUT_BYTES,
  MAX_LOCAL_INPUT_BYTES,
  PREFLIGHT_RESULT_NAME,
  STAGED_DIR_NAME,
} from "./constants.mjs";
import { PREFLIGHT_CONTRACT, toWrapperRequest } from "./contract.mjs";
import { declaredIdentity, formatDigest, sha256Buffer } from "./digest.mjs";
import { createNullEngineAdapter, LATER_ENGINE_BINDING } from "./engine-adapter.mjs";
import { classifyInputValue } from "./inline.mjs";
import { validateStagedInput } from "./input-schema.mjs";
import { assertExecutionInputBytes, flagToKey, readBoundedRegularFile, resolveInputPath } from "./paths.mjs";
import { refuse } from "./refuse.mjs";
import { inspectStagedSample } from "./sample.mjs";
import { isJobDocumentKey, stageJobDocumentCaptures } from "./job-document.mjs";
import { copySiblingSampleMarkers, ensureStagedDir, writeStagedBytes } from "./stage.mjs";

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

function materializeOne(key, declaredPath, { inputRoot }) {
  const classified = classifyInputValue(declaredPath);
  if (classified.kind === "invalid") {
    throw refuse("input-malformed", `Input ${key} must be a file path or JSON object`, { key });
  }
  if (classified.kind === "empty") return null;

  if (key === "input-root") {
    if (classified.kind !== "path") {
      throw refuse("input-root-not-directory", "input-root must be a filesystem directory path", { key });
    }
    const dirPath = path.resolve(classified.path);
    let st;
    try {
      st = fs.statSync(dirPath);
    } catch {
      throw refuse("input-missing-file", `Input ${key} directory not found: ${dirPath}`, { key, path: dirPath });
    }
    if (!st.isDirectory()) {
      throw refuse("input-root-not-directory", `Input input-root must be a directory: ${dirPath}`, {
        key,
        path: dirPath,
      });
    }
    return {
      key,
      kind: "directory",
      path: dirPath,
      inline: false,
      buffer: null,
      text: null,
      bytes: null,
      sha256: null,
    };
  }

  if (classified.kind === "json-value" || classified.kind === "json-text") {
    const buffer = Buffer.from(classified.text, "utf8");
    if (buffer.length > MAX_LOCAL_INPUT_BYTES) {
      throw refuse("input-too-large", `Local input exceeds ${MAX_LOCAL_INPUT_BYTES} byte bound`, {
        key,
        size: buffer.length,
        limit: MAX_LOCAL_INPUT_BYTES,
        kitLimitBytes: KIT_MAX_LOCAL_INPUT_BYTES,
      });
    }
    return {
      key,
      kind: "file",
      path: null,
      inline: true,
      buffer,
      text: classified.text,
      bytes: buffer.length,
      sha256: sha256Buffer(buffer),
    };
  }

  const abs = resolveInputPath(String(classified.path), { inputRoot });
  const actual = readBoundedRegularFile(abs, { inputRoot });
  return {
    key,
    kind: "file",
    path: actual.path,
    inline: false,
    buffer: actual.buffer,
    text: actual.buffer.toString("utf8"),
    bytes: actual.bytes,
    sha256: actual.sha256,
  };
}

function snapshotInputs(staged) {
  const inputs = {};
  for (const item of staged) {
    if (item.kind === "directory") {
      inputs[item.key] = {
        flag: `--${item.key}`,
        kind: "directory",
        path: item.path,
        inline: false,
      };
      continue;
    }
    inputs[item.key] = {
      flag: `--${item.key}`,
      kind: "file",
      path: item.path,
      stagedPath: item.stagedPath || null,
      inline: item.inline,
      bytes: item.bytes,
      sha256: item.sha256,
      digest: formatDigest(item.sha256),
      json: item.json === true,
      encoding: item.encoding || null,
      ...(item.inline ? { text: item.text } : {}),
    };
  }
  return inputs;
}

function refuseWithStaged(code, message, extra, staged, stagedDir, job) {
  throw refuse(code, message, {
    ...extra,
    job: job?.id,
    stagedDir,
    inputs: snapshotInputs(staged),
  });
}

/**
 * Preflight caller files / inline JSON against catalog requiredInputs.
 * Never invokes the job engine. No spend or tool-cost claims.
 * Stages exact bytes, then validates schema and refuses disguised SAMPLE.
 * ok:true is bounded by execution.v1 1 MiB, not only the kit 8 MiB cap.
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
    (k) => k !== "example",
  );

  const staged = [];
  for (const key of fileKeys) {
    const declaredPath = flags[key];
    if (declaredPath == null || declaredPath === false || declaredPath === "") continue;
    const item = materializeOne(key, declaredPath, { inputRoot });
    if (!item) continue;

    if (item.kind === "file") {
      const slotDeclared = declared[key] || {};
      const identity = declaredIdentity({
        digest: flags[`${key}-digest`] ?? slotDeclared.digest,
        sha256: flags[`${key}-sha256`] ?? slotDeclared.sha256,
        bytes: flags[`${key}-bytes`] ?? slotDeclared.bytes,
      });
      if (identity.digestHex && identity.digestHex !== item.sha256) {
        throw refuse("input-digest-mismatch", "Declared digest does not match staged bytes", {
          key,
          path: item.path,
          inline: item.inline,
          declaredDigest: formatDigest(identity.digestHex),
          actualDigest: formatDigest(item.sha256),
          declaredBytes: identity.bytes,
          actualBytes: item.bytes,
        });
      }
      if (identity.bytes != null && Number(identity.bytes) !== item.bytes) {
        throw refuse("input-digest-mismatch", "Declared digest/bytes do not match staged bytes", {
          key,
          path: item.path,
          declaredBytes: identity.bytes,
          actualBytes: item.bytes,
          actualDigest: formatDigest(item.sha256),
        });
      }
    }
    staged.push(item);
  }

  const { outDir, stagedDir } = ensureStagedDir(options.outDir || null);
  for (const item of staged) {
    if (item.kind !== "file") continue;
    item.stagedPath = writeStagedBytes(stagedDir, item);
    if (item.path) copySiblingSampleMarkers(item.path, stagedDir);
  }

  const nestedCaptures = [];
  for (const item of staged) {
    if (item.kind !== "file" || !isJobDocumentKey(item.key)) continue;
    nestedCaptures.push(...stageJobDocumentCaptures(item, stagedDir));
  }
  staged.push(...nestedCaptures);

  for (const item of staged) {
    if (item.kind !== "file") continue;
    try {
      assertExecutionInputBytes(item.key, item.bytes, { stagedPath: item.stagedPath, path: item.path });
    } catch (err) {
      err.detail = {
        ...(err.detail || {}),
        job: job.id,
        stagedDir,
        inputs: snapshotInputs(staged),
      };
      throw err;
    }
  }

  const sampleInfo = inspectStagedSample(
    { example: false, staged },
    { kitRoot: options.kitRoot || null },
  );
  if (options.d01Sample && options.d01Sample.sample) {
    for (const reason of options.d01Sample.reasons || []) {
      if (!sampleInfo.reasons.includes(reason)) sampleInfo.reasons.push(reason);
    }
    sampleInfo.sample = true;
  }
  if (sampleInfo.sample) {
    refuseWithStaged(
      "disguised-sample",
      "SAMPLE-labelled or kit-sample input is not a caller custom input; preflight does not substitute samples",
      { sampleReasons: sampleInfo.reasons },
      staged,
      stagedDir,
      job,
    );
  }

  for (const item of staged) {
    if (item.kind !== "file") continue;
    try {
      const schema = validateStagedInput(job, item.key, item.buffer);
      item.encoding = schema.encoding;
      item.json = schema.json === true;
    } catch (err) {
      err.detail = {
        ...(err.detail || {}),
        job: job.id,
        stagedDir,
        inputs: snapshotInputs(staged),
      };
      throw err;
    }
  }

  if (typeof engineAdapter.invoke !== "function") {
    throw refuse("invalid-engine-adapter", "engine adapter is missing invoke()");
  }

  const inputs = snapshotInputs(staged);
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
    contract: PREFLIGHT_CONTRACT,
    executionContractVersion: EXECUTION_CONTRACT_VERSION,
    sample: false,
    sampleReasons: [],
    purchaseAuthority: false,
    spendClaim: false,
    toolCostClaim: false,
    preSpendSavingsClaim: false,
    limitBytes: EXECUTION_MAX_INPUT_BYTES,
    kitLimitBytes: KIT_MAX_LOCAL_INPUT_BYTES,
    stagedDir,
    inputRoot,
    inputs,
  };

  result.wrapperRequest = toWrapperRequest(result);

  if (outDir) {
    result.outDir = outDir;
    result.written = [PREFLIGHT_RESULT_NAME, STAGED_DIR_NAME];
    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, PREFLIGHT_RESULT_NAME);
    fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}
