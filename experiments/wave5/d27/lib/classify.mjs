import { existsSync } from "node:fs";
import { join } from "node:path";
import { ANALYSIS_KIND, KIND, WRAPPER_REFUSE_CODES } from "./contract.mjs";
import { EXPECTED_OUTPUTS } from "./paths.mjs";

function analysisStatus(wrapper, artifact) {
  const direct = wrapper?.analysis;
  if (typeof direct === "string" && direct) return direct;
  if (direct && typeof direct === "object" && typeof direct.status === "string") return direct.status;
  const engine = wrapper?.engine;
  if (engine && typeof engine.status === "string") return engine.status;
  if (artifact && typeof artifact.status === "string") return artifact.status;
  return null;
}

function expectedPresent(outDir, expected = EXPECTED_OUTPUTS) {
  if (!outDir) return { expected, present: [], missing: [...expected] };
  const present = expected.filter((name) => existsSync(join(outDir, name)));
  const missing = expected.filter((name) => !present.includes(name));
  return { expected, present, missing, complete: missing.length === 0 };
}

export function classifyTrial({ honesty, transport, wrapper, outDir, artifact = null, expected = EXPECTED_OUTPUTS }) {
  if (honesty?.refused) {
    return {
      kind: KIND.HONESTY_REFUSE,
      code: honesty.code,
      engineInvoked: false,
      analysis: null,
    };
  }

  if (transport?.failure) {
    return {
      kind: KIND.TRANSPORT_FAILURE,
      code: transport.code || "transport-failure",
      engineInvoked: false,
      analysis: null,
      error: transport.error || null,
    };
  }

  if (!wrapper || typeof wrapper !== "object") {
    return {
      kind: KIND.TRANSPORT_FAILURE,
      code: "missing-wrapper-result",
      engineInvoked: false,
      analysis: null,
    };
  }

  if (wrapper.sample === true) {
    return {
      kind: KIND.SAMPLE_NOT_SALE,
      code: wrapper.code || "sample-not-a-sale",
      engineInvoked: Boolean(wrapper.engine),
      analysis: analysisStatus(wrapper, artifact),
    };
  }

  if (wrapper.ok === false && WRAPPER_REFUSE_CODES.includes(wrapper.code)) {
    return {
      kind: KIND.WRAPPER_REFUSAL,
      code: wrapper.code,
      engineInvoked: false,
      analysis: null,
    };
  }

  const delivery = wrapper.delivery;
  const files = expectedPresent(outDir, expected);
  const complete = delivery && typeof delivery.complete === "boolean" ? delivery.complete : files.complete;

  if (!complete) {
    return {
      kind: KIND.INCOMPLETE_DELIVERY,
      code: wrapper.code || "missing-output",
      engineInvoked: Boolean(wrapper.engine),
      analysis: analysisStatus(wrapper, artifact),
      files,
    };
  }

  const analysis = analysisStatus(wrapper, artifact);
  const mapped = ANALYSIS_KIND[analysis];
  if (mapped) {
    return {
      kind: mapped,
      code: wrapper.code || null,
      engineInvoked: true,
      analysis,
      files,
    };
  }

  if (wrapper.ok === true) {
    return {
      kind: KIND.USEFUL_CHANGE,
      code: null,
      engineInvoked: true,
      analysis,
      files,
    };
  }

  return {
    kind: KIND.TRANSPORT_FAILURE,
    code: wrapper.code || "unclassified-wrapper",
    engineInvoked: Boolean(wrapper.engine),
    analysis,
  };
}
