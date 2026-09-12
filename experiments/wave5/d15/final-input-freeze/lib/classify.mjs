export const KIND = Object.freeze({
  FROZEN_CONSUMED: "frozen-consumed",
  RACE_CONSUMED_MUTATED: "race-consumed-mutated",
  ACCURATE_REFUSE: "accurate-refuse",
  CONTROL: "control",
  ENGINE_FAILURE: "engine-failure",
});

export function classifyPrepareExecute({
  inspectSha,
  liveSha,
  overlaySha,
  controlOutcome,
  overlayOutcome,
  racedOutcome,
  receiptSha,
  refused,
  refuseCode,
}) {
  if (refused) {
    return {
      kind: KIND.ACCURATE_REFUSE,
      refuseCode: refuseCode || null,
      racedOutcome,
      receiptSha: receiptSha || null,
      inspectSha,
      liveSha,
    };
  }
  const liveIsOverlay = overlaySha && liveSha === overlaySha && liveSha !== inspectSha;
  const receiptMatchesInspect = receiptSha && inspectSha && receiptSha === inspectSha;
  if (liveIsOverlay && racedOutcome === controlOutcome && receiptMatchesInspect) {
    return {
      kind: KIND.FROZEN_CONSUMED,
      racedOutcome,
      receiptSha,
      inspectSha,
      liveSha,
    };
  }
  if (liveIsOverlay && overlayOutcome && racedOutcome === overlayOutcome) {
    return {
      kind: KIND.RACE_CONSUMED_MUTATED,
      racedOutcome,
      receiptSha: receiptSha || null,
      inspectSha,
      liveSha,
    };
  }
  return {
    kind: liveIsOverlay ? KIND.RACE_CONSUMED_MUTATED : KIND.ENGINE_FAILURE,
    racedOutcome,
    receiptSha: receiptSha || null,
    inspectSha,
    liveSha,
  };
}

export function inputSha(body, flag) {
  const rows = body?.order?.inputs || [];
  const hit = rows.find((row) => row.flag === flag || row.flag === `--${flag}`);
  return hit?.sha256 || null;
}

export function receiptInputSha(body, name) {
  const rows = body?.order?.wrapper?.receipt?.inputs || [];
  const hit = rows.find((row) => row.name === name);
  return hit?.sha256 || null;
}
