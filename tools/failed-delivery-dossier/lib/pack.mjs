import { honestyEnvelope } from "./honesty.mjs";
import { adapterFor, defaultAdapters } from "./adapters.mjs";
import {
  detectBuyerClassRevenueMix,
  detectForbiddenAction,
  integerTermsVersion,
  isSampleLabelledDelivered,
} from "./guards.mjs";
import { isPlainObject, loadJsonFile, resolveInputPath } from "./json.mjs";
import {
  DOSSIER_SCHEMA,
  ERROR_CODES,
  F08_SHA,
  LIVE_EXTRACT_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  SDS52_SHA,
  SDS_MAIN_SHA,
  SOURCE_KINDS,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { refuseBadObservationClaim } from "./observation.mjs";
import { buildHonestyChecks } from "./source-status.mjs";

function asItems(input) {
  if (Array.isArray(input.items)) return input.items;
  const items = [];
  for (const sourceKind of SOURCE_KINDS) {
    if (input[sourceKind]) {
      items.push({
        sourceKind,
        body: input[sourceKind].body ?? input[sourceKind],
        path: input[sourceKind].path,
      });
    }
  }
  return items;
}

export function packDossier(input = {}, options = {}) {
  const adapters = { ...defaultAdapters, ...(options.adapters || {}) };
  const flags = options.flags || {};

  if (!isPlainObject(input) && !Array.isArray(input)) {
    return refuse(ERROR_CODES.INVALID_JSON, "pack input must be a JSON object");
  }

  const actionHit = detectForbiddenAction(input, flags);
  if (actionHit) {
    return refuse(actionHit.code, actionHit.message, {
      refundAttempted: actionHit.code === ERROR_CODES.REFUND_REFUSED,
    });
  }

  if (flags.asRevenue === true || input.asRevenue === true) {
    return refuse(ERROR_CODES.BUYERCLASS_REVENUE_MIX, "mixing buyerClass into a revenue total is refused");
  }

  const mix = detectBuyerClassRevenueMix(input);
  if (mix) {
    return refuse(ERROR_CODES.BUYERCLASS_REVENUE_MIX, `mixing buyerClass into a revenue total is refused (${mix})`);
  }

  const items = asItems(input);
  if (!items.length) {
    return refuse(ERROR_CODES.MISSING_REQUIRED_INPUTS, "pack requires wrapper-receipt, checkout-intake, and/or extract-unpaid items");
  }

  const evidence = [];
  for (const item of items) {
    const sourceKind = item.sourceKind;
    if (!SOURCE_KINDS.includes(sourceKind)) {
      return refuse(ERROR_CODES.UNKNOWN_SOURCE_KIND, `unknown source kind ${String(sourceKind)}`);
    }
    let body = item.body;
    if (body == null && item.path) {
      const loaded = loadJsonFile(item.path);
      if (!loaded.ok) return loaded.result;
      body = loaded.value;
    }
    if (!isPlainObject(body)) {
      return refuse(ERROR_CODES.INVALID_JSON, `${sourceKind} body must be a JSON object`);
    }
    const claim = refuseBadObservationClaim(item, body);
    if (claim) return claim;
    if (isSampleLabelledDelivered(body)) {
      return refuse(
        ERROR_CODES.SAMPLE_LABELLED_DELIVERED,
        "SAMPLE receipt labelled delivered is refused; sample is not a delivery in hand",
      );
    }
    const tv = integerTermsVersion(body);
    if (tv != null) {
      return refuse(
        ERROR_CODES.INTEGER_TERMS_VERSION,
        "integer termsVersion is refused; I01 Neo PR54 uses sha256: + 64 hex",
        { termsVersion: tv },
      );
    }
    const mixItem = detectBuyerClassRevenueMix(body);
    if (mixItem) {
      return refuse(
        ERROR_CODES.BUYERCLASS_REVENUE_MIX,
        `mixing buyerClass into a revenue total is refused (${mixItem})`,
      );
    }
    const parse = adapterFor(sourceKind, adapters);
    const parsed = parse({ ...item, body });
    if (!parsed.ok) return parsed;
    evidence.push(parsed.evidence);
  }

  const kinds = evidence.map((row) => row.sourceKind);
  const checks = buildHonestyChecks(evidence, options);
  const observed402 = evidence.some(
    (row) => row.observationStatus === "observed" && row.observedHttpStatus === 402,
  );
  const expected402 = evidence.some(
    (row) => row.observationStatus === "expected" && row.expectedStatus === 402,
  );
  const externalExtract = evidence.filter(
    (row) => row.sourceKind === "extract-unpaid" && row.origin?.class === "external" && row.observationStatus === "observed",
  );
  const liveExternal = externalExtract.length > 0;
  const pinEvidence = Object.fromEntries(
    (options.pinChecks || [])
      .filter((check) => check.id === "f08-pin-worktree" || check.id === "sds52-pin-worktree")
      .map((check) => [
        check.id === "f08-pin-worktree" ? "f08Capture" : "sds52",
        {
          sha: check.sha || null,
          status: check.status === "observed" && check.pass ? "verified" : check.status,
          evidence: check.got ? { gitHead: check.got, file: check.file } : null,
        },
      ]),
  );
  return {
    ok: true,
    schema: DOSSIER_SCHEMA,
    sold: false,
    deliveryInHand: false,
    evidence,
    sourceKinds: kinds,
    honesty: honestyEnvelope({
      itemCount: evidence.length,
      checks,
      liveExtractUnpaid: {
        amount: LIVE_EXTRACT_PRICE_USDC,
        amountAtomic: LIVE_EXTRACT_ATOMIC,
        observationStatus: liveExternal ? "observed" : "unrun",
        observedHttpStatus: externalExtract.length === 1 ? externalExtract[0].observedHttpStatus : null,
        observedHttpStatuses: externalExtract.map((row) => row.observedHttpStatus),
        localRuntime402: evidence.some((row) => row.sourceKind === "extract-unpaid" && row.origin?.class === "local-runtime" && row.observedHttpStatus === 402),
        expected402Only: expected402 && !observed402 && !liveExternal,
        note: liveExternal
          ? "External extract HTTP was captured. Catalog amount is unchanged."
          : observed402
            ? "Local-runtime HTTP 402 was captured. Live production extract remains unrun."
            : expected402
              ? "Catalog or fixture expects HTTP 402. That expectation is not an observed response."
              : "Catalog amount is expected. Live extract HTTP was not observed.",
      },
      sourceStatus: {
        sdsMain: { sha: SDS_MAIN_SHA, status: "claimed", evidence: null },
        f08Capture: pinEvidence.f08Capture || {
          sha: F08_SHA,
          status: "fixture",
          evidence: null,
        },
        sds52: pinEvidence.sds52 || {
          sha: SDS52_SHA,
          status: "claimed",
          evidence: null,
        },
      },
    }),
  };
}

export async function packFromPaths(spec, options = {}) {
  const cwd = options.cwd || process.cwd();
  const items = [];
  for (const sourceKind of SOURCE_KINDS) {
    const pathArg = spec[sourceKind];
    if (!pathArg) continue;
    const filePath = resolveInputPath(pathArg, cwd);
    const loaded = loadJsonFile(filePath);
    if (!loaded.ok) return loaded.result;
    items.push({ sourceKind, body: loaded.value, path: filePath });
  }
  return packDossier({ items, action: spec.action, asRevenue: spec.asRevenue, refund: spec.refund, retryPayment: spec.retryPayment, sendPaymentSignature: spec.sendPaymentSignature, revenueTotal: spec.revenueTotal }, options);
}
