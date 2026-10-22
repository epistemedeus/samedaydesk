const SAMPLE_LABEL = "SAMPLE";
const SALE_LABEL = "sale";

export { SAMPLE_LABEL, SALE_LABEL };

const SAMPLE_NAME_RE = /(^|\/)SAMPLE(\.|$)/i;
const SAMPLE_EXT_RE = /\.SAMPLE(\.|$)/i;
const SAMPLE_FIXTURE_RE = /SAMPLE fixture/i;

export function isSampleFileName(name) {
  const base = String(name).split("/").pop() || "";
  return SAMPLE_NAME_RE.test(name) || SAMPLE_EXT_RE.test(name) || /^SAMPLE(\.|$)/i.test(base);
}

export function pathLooksLikeSample(value) {
  if (typeof value !== "string" || !value) return false;
  const normalized = value.replaceAll("\\", "/");
  return (
    normalized.includes("/samples/") ||
    normalized.startsWith("samples/") ||
    normalized.includes("\\samples\\")
  );
}

function walkSampleSignals(value, acc) {
  if (typeof value === "string") {
    if (SAMPLE_FIXTURE_RE.test(value)) acc.fixtureText = true;
    if (pathLooksLikeSample(value)) acc.samplePath = true;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkSampleSignals(item, acc);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value.exampleMode === true) acc.exampleMode = true;
  if (value.sampleLabel === "explicit-example") acc.explicitExample = true;
  if (typeof value.sampleLabel === "string" && /sample/i.test(value.sampleLabel) && value.sampleLabel !== "caller-input") {
    acc.explicitExample = true;
  }
  for (const child of Object.values(value)) walkSampleSignals(child, acc);
}

export function inferProvenanceLabel(files) {
  const acc = {
    exampleMode: false,
    explicitExample: false,
    samplePath: false,
    fixtureText: false,
    sampleFileName: false,
  };
  for (const file of files) {
    if (isSampleFileName(file.path)) acc.sampleFileName = true;
    const text = file.text;
    if (typeof text === "string" && /\.(json|jsonl|ics|md|txt|xml|html)$/i.test(file.path)) {
      if (SAMPLE_FIXTURE_RE.test(text)) acc.fixtureText = true;
      if (pathLooksLikeSample(text)) acc.samplePath = true;
    }
    if (file.json) walkSampleSignals(file.json, acc);
  }
  const sample =
    acc.exampleMode || acc.explicitExample || acc.samplePath || acc.fixtureText || acc.sampleFileName;
  return {
    label: sample ? SAMPLE_LABEL : SALE_LABEL,
    reasons: acc,
  };
}

export function resolveLabel({ inferred, requestedLabel, asCustomerDelivery }) {
  const inferredSample = inferred.label === SAMPLE_LABEL;
  if (asCustomerDelivery) {
    return {
      ok: false,
      code: inferredSample ? "sample-not-customer-delivery" : "not-customer-delivery",
      message: inferredSample
        ? "Refuse to mark SAMPLE as customer-delivery"
        : "This exporter never marks an archive as customer-delivery",
    };
  }
  if (requestedLabel === SALE_LABEL && inferredSample) {
    return {
      ok: false,
      code: "sample-not-sale",
      message: "Refuse to relabel SAMPLE as sale",
    };
  }
  if (requestedLabel === "customer" || requestedLabel === "customer-delivery") {
    return {
      ok: false,
      code: "sample-not-customer-delivery",
      message: "Refuse to mark SAMPLE as customer-delivery",
    };
  }
  const label = requestedLabel === SAMPLE_LABEL ? SAMPLE_LABEL : inferred.label;
  return {
    ok: true,
    label,
    customerDelivery: false,
    notSettling: true,
  };
}
