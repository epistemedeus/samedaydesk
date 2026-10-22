function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walkSampleHits(value, into) {
  if (typeof value === "string") {
    if (value === "SAMPLE" || /^SAMPLE\b/i.test(value)) into.push("string-SAMPLE");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkSampleHits(item, into);
    return;
  }
  if (!isPlainObject(value)) return;
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") into.push("json-sample-label");
  if (value.exampleMode === true) into.push("exampleMode");
  if (value.evidenceClass === "sample") into.push("evidenceClass-sample");
  for (const child of Object.values(value)) walkSampleHits(child, into);
}

/**
 * SAMPLE / --example packets cannot become accepted_correction.
 */
export function inspectSample(request, { caseObject = null } = {}) {
  const reasons = [];
  if (request?.example === true || request?.example === "true") reasons.push("example-flag");

  if (caseObject) {
    const hits = [];
    walkSampleHits(caseObject, hits);
    if (hits.length) reasons.push("json-sample-label");
    if (caseObject.label === "SAMPLE" || caseObject.sample === true) {
      reasons.push("case-label-SAMPLE");
    }
    const packet = caseObject.packet;
    if (isPlainObject(packet)) {
      if (packet.label === "SAMPLE" || packet.sample === true || packet.sampleLabel === "SAMPLE") {
        reasons.push("packet-SAMPLE");
      }
    }
    const provenance = caseObject.engineInput?.callerProvenance;
    if (isPlainObject(provenance) && (provenance.sampleLabel === "SAMPLE" || provenance.sample === true)) {
      reasons.push("engineInput-SAMPLE");
    }
  }

  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

export function packetWantsAcceptedCorrection(packet) {
  if (!isPlainObject(packet)) return false;
  return (
    packet.accepted_correction === true ||
    packet.status === "accepted_correction" ||
    packet.disposition === "accepted_correction"
  );
}
