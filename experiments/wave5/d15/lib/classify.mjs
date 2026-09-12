import { BIND, KIND, REFUSE_CODE, WRAPPER_REFUSE_CODES } from "./contract.mjs";
import { liveFileSha } from "./freeze.mjs";

function receiptFileMap(wrapper) {
  const rows = wrapper?.receipt?.inputs || [];
  const map = {};
  for (const row of rows) {
    if (row && row.name) map[row.name] = row;
  }
  return map;
}

function domainFrom(wrapper, outDirFiles) {
  const engine = wrapper?.engine && typeof wrapper.engine === "object" ? wrapper.engine : null;
  const artifact = outDirFiles?.impact || null;
  const status = engine?.status || artifact?.status || null;
  const digest = engine?.digest || artifact?.digest || null;
  const summary = engine?.summary || artifact?.summary || null;
  return { status, digest, summary };
}

export function classifyRace({ bind, snapshot, drifted, wrapper, transport, mutated }) {
  if (bind === BIND.VERIFY_LIVE && drifted && drifted.length) {
    return {
      kind: KIND.ACCURATE_REFUSE,
      code: REFUSE_CODE,
      engineInvoked: false,
      drifted,
    };
  }

  if (transport?.failure) {
    return {
      kind: KIND.TRANSPORT_FAILURE,
      code: transport.code || "transport-failure",
      engineInvoked: false,
      error: transport.error || null,
    };
  }

  if (!wrapper) {
    return {
      kind: KIND.TRANSPORT_FAILURE,
      code: "missing-wrapper-result",
      engineInvoked: false,
    };
  }

  if (wrapper.ok === false && WRAPPER_REFUSE_CODES.includes(wrapper.code)) {
    return {
      kind: KIND.WRAPPER_REFUSE,
      code: wrapper.code,
      engineInvoked: false,
    };
  }

  if (mutated && bind === BIND.LIVE_OBSERVE && drifted && drifted.length) {
    return {
      kind: KIND.RACE_CONSUMED_MUTATED,
      code: wrapper.code || null,
      engineInvoked: true,
      drifted,
    };
  }

  const engine = wrapper.engine;
  const engineFailed =
    wrapper.ok === false &&
    (wrapper.code === "engine-refused" ||
      (engine && typeof engine === "object" && (engine.status !== 0 && engine.ok === false)));
  if (wrapper.ok === false && (engineFailed || wrapper.code === "engine-refused" || wrapper.code === "internal-error")) {
    return {
      kind: KIND.ENGINE_FAILURE,
      code: wrapper.code || "engine-failure",
      engineInvoked: true,
    };
  }

  const receipts = receiptFileMap(wrapper);
  let matchedFreeze = 0;
  let matchedMutatedLive = 0;
  let compared = 0;
  for (const entry of Object.values(snapshot.files)) {
    if (entry.kind !== "file") continue;
    const rec = receipts[entry.key];
    if (!rec || !rec.sha256) continue;
    compared += 1;
    if (rec.sha256 === entry.sha256) matchedFreeze += 1;
    const liveNow = liveFileSha(entry);
    if (mutated && liveNow && rec.sha256 === liveNow && liveNow !== entry.sha256) {
      matchedMutatedLive += 1;
    }
  }

  if (mutated && matchedMutatedLive > 0 && matchedFreeze < compared) {
    return {
      kind: KIND.RACE_CONSUMED_MUTATED,
      code: null,
      engineInvoked: true,
      compared,
      matchedFreeze,
      matchedMutatedLive,
    };
  }

  if (compared > 0 && matchedFreeze === compared) {
    return {
      kind: KIND.FROZEN_CONSUMED,
      code: null,
      engineInvoked: true,
      compared,
      matchedFreeze,
    };
  }

  if (wrapper.ok === true) {
    return {
      kind: bind === BIND.FROZEN ? KIND.FROZEN_CONSUMED : KIND.RACE_CONSUMED_MUTATED,
      code: null,
      engineInvoked: true,
      compared,
      matchedFreeze,
    };
  }

  return {
    kind: KIND.ENGINE_FAILURE,
    code: wrapper.code || "unclassified-failure",
    engineInvoked: true,
  };
}

export function attachDomain(classified, wrapper, outDirFiles) {
  return {
    ...classified,
    domain: domainFrom(wrapper, outDirFiles),
  };
}
