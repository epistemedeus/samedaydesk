import { LIFECYCLE_KINDS } from "./contract.mjs";
import { parseStdoutJson } from "./json.mjs";

function notSuccess(kind, extra = {}) {
  return {
    kind,
    accepted: false,
    hiddenByWrapperSuccess: false,
    domainOutcome: null,
    ...extra,
  };
}

export function classifyEngineLifecycle({
  threw = null,
  wrapper = null,
  spawn = {},
  engineStdout = "",
  requiredOutputCount = 2,
} = {}) {
  const wrapperOk = wrapper?.ok === true;
  const sold = wrapper?.sold === true;
  const outputCount = Array.isArray(wrapper?.outputs) ? wrapper.outputs.length : 0;
  const parsed = parseStdoutJson(engineStdout);
  const spawnStatus = spawn.status;
  const timedOut =
    spawn.timedOut === true ||
    spawn.errorCode === "ETIMEDOUT" ||
    spawn.signal === "SIGTERM" ||
    spawn.signal === "SIGKILL";

  if (sold) {
    return notSuccess(LIFECYCLE_KINDS.HIDDEN_BY_WRAPPER, {
      hiddenByWrapperSuccess: wrapperOk,
      reason: "sold-true-is-never-a-lifecycle-success-here",
    });
  }

  if (threw) {
    const msg = String(threw.message || threw);
    const install =
      threw.code === "EEXIST" ||
      /mkdir/i.test(msg) ||
      /archive/i.test(msg) ||
      /timeout waiting for useful-jobs/i.test(msg);
    return notSuccess(install ? LIFECYCLE_KINDS.INSTALL_FAILURE : LIFECYCLE_KINDS.WRAPPER_UNCAUGHT, {
      error: msg,
      code: threw.code || null,
    });
  }

  if (timedOut && (spawnStatus === null || spawnStatus === undefined)) {
    return notSuccess(LIFECYCLE_KINDS.TIMEOUT, {
      signal: spawn.signal || null,
      errorCode: spawn.errorCode || null,
    });
  }

  if (spawn.errorCode === "ENOENT") {
    return notSuccess(LIFECYCLE_KINDS.START_FAILURE, { errorCode: "ENOENT" });
  }

  const stderr = String(spawn.stderr || "");
  if (
    spawnStatus === 1 &&
    /Cannot find module/i.test(stderr) &&
    !parsed.whole
  ) {
    return notSuccess(LIFECYCLE_KINDS.START_FAILURE, { stderrHead: stderr.slice(0, 180) });
  }

  if (spawnStatus !== 0 && spawnStatus !== null && spawnStatus !== undefined) {
    if (parsed.json && parsed.json.ok === false) {
      return notSuccess(LIFECYCLE_KINDS.ENGINE_REFUSED_JSON, {
        code: parsed.json.code || wrapper?.code || null,
        engineError: parsed.json.error || null,
      });
    }
    return notSuccess(LIFECYCLE_KINDS.NONZERO_EXIT, {
      status: spawnStatus,
      code: wrapper?.code || "engine-refused",
    });
  }

  if (parsed.empty) {
    return notSuccess(LIFECYCLE_KINDS.MISSING_JSON, {
      hiddenByWrapperSuccess: wrapperOk,
    });
  }

  if (!parsed.whole || parsed.sliced) {
    return notSuccess(LIFECYCLE_KINDS.INVALID_JSON, {
      hiddenByWrapperSuccess: wrapperOk,
      sliced: parsed.sliced === true,
    });
  }

  if (parsed.json.ok === false) {
    return notSuccess(LIFECYCLE_KINDS.ENGINE_REFUSED_JSON, {
      code: parsed.json.code || wrapper?.code || null,
    });
  }

  if (parsed.json.ok !== true) {
    return notSuccess(LIFECYCLE_KINDS.INVALID_JSON, {
      hiddenByWrapperSuccess: wrapperOk,
      reason: "ok-not-true",
    });
  }

  if (outputCount < requiredOutputCount) {
    return notSuccess(
      wrapperOk ? LIFECYCLE_KINDS.HIDDEN_BY_WRAPPER : LIFECYCLE_KINDS.MISSING_OUTPUTS,
      {
        hiddenByWrapperSuccess: wrapperOk,
        outputCount,
        requiredOutputCount,
      },
    );
  }

  if (!wrapperOk) {
    return notSuccess(LIFECYCLE_KINDS.ENGINE_REFUSED_JSON, {
      code: wrapper?.code || null,
      reason: "engine-json-ok-but-wrapper-not-ok",
    });
  }

  return {
    kind: LIFECYCLE_KINDS.ENGINE_RAN,
    accepted: true,
    hiddenByWrapperSuccess: false,
    domainOutcome: parsed.json.status || null,
  };
}
