import {
  isExactEvmV2IndexingContinuitySupported,
  planIndexingPayloadContinuity,
} from "../fixtures/merchant-pr54/indexing-payload-continuity.mjs";
import { MERCHANT_PIN } from "./constants.ts";
import { UNSIGNED_HINT_NOT_AUTHORITY } from "./failures.ts";
import type { MetadataDiagnostic } from "./types.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function presentValue(holder: unknown, key: string): boolean {
  if (!isPlainObject(holder) || !Object.prototype.hasOwnProperty.call(holder, key)) {
    return false;
  }
  const value = holder[key];
  return value !== undefined && value !== null;
}

function hintDrift(present: boolean, value: unknown): MetadataDiagnostic["drift"] {
  if (!present) return "missing_hint";
  if (!isPlainObject(value)) return "mismatch";
  return "none";
}

function payloadDrift(present: boolean, value: unknown): MetadataDiagnostic["drift"] {
  if (!present) return "unknown";
  if (!isPlainObject(value)) return "mismatch";
  return "none";
}

export type DiagnoseOptions = {
  declared?: unknown;
  requirements?: unknown;
  siblingPaymentRequirements?: unknown;
};

export type DiagnoseResult = {
  diagnostics: MetadataDiagnostic[];
  paymentRetried: false;
  declinedPayment: false;
  bazaarIndexes: readonly ["resource", "extensions.bazaar"];
  signedAuthority: "payload";
  merchantPin: typeof MERCHANT_PIN;
  continuity: {
    supported: boolean;
    untouchedAuthority: true;
    declinedPayment: false;
    resourceProvenance: string;
    bazaarProvenance: string;
  };
};

export function diagnosePaymentPayload(
  paymentPayload: unknown,
  options: DiagnoseOptions = {},
): DiagnoseResult {
  const payloadObj = isPlainObject(paymentPayload) ? paymentPayload : {};
  const payloadPresent = presentValue(payloadObj, "payload");
  const resourcePresent = presentValue(payloadObj, "resource");
  const extensionsPresent = presentValue(payloadObj, "extensions");
  const extensions = isPlainObject(payloadObj.extensions) ? payloadObj.extensions : null;
  const bazaarPresent = Boolean(
    extensions && presentValue(extensions, "bazaar"),
  );
  const requirementsSiblingPresent =
    presentValue(payloadObj, "paymentRequirements")
    || options.siblingPaymentRequirements !== undefined
    && options.siblingPaymentRequirements !== null;

  const requirements = options.requirements ?? { scheme: "exact", network: "eip155:8453" };
  const supported = isExactEvmV2IndexingContinuitySupported(payloadObj, requirements);
  const planned = planIndexingPayloadContinuity(
    payloadObj,
    isPlainObject(options.declared) ? options.declared : {},
  );

  const diagnostics: MetadataDiagnostic[] = [
    {
      field: "payload",
      present: payloadPresent,
      signed: true,
      drift: payloadDrift(payloadPresent, payloadObj.payload),
    },
    {
      field: "resource",
      present: resourcePresent,
      signed: false,
      drift: hintDrift(resourcePresent, payloadObj.resource),
    },
    {
      field: "extensions.bazaar",
      present: bazaarPresent,
      signed: false,
      drift: hintDrift(
        bazaarPresent,
        extensionsPresent && extensions ? extensions.bazaar : undefined,
      ),
    },
    {
      field: "other",
      present: requirementsSiblingPresent,
      signed: false,
      drift: "none",
    },
  ];

  return {
    diagnostics,
    paymentRetried: false,
    declinedPayment: false,
    bazaarIndexes: ["resource", "extensions.bazaar"],
    signedAuthority: "payload",
    merchantPin: MERCHANT_PIN,
    continuity: {
      supported,
      untouchedAuthority: true,
      declinedPayment: false,
      resourceProvenance: planned.provenance.resource,
      bazaarProvenance: planned.provenance.bazaar,
    },
  };
}

export function assertHonestDiagnostics(
  diagnostics: MetadataDiagnostic[],
):
  | { ok: true; rejected: false; diagnostics: MetadataDiagnostic[] }
  | {
    ok: false;
    rejected: true;
    failure: typeof UNSIGNED_HINT_NOT_AUTHORITY;
    offender: MetadataDiagnostic;
  } {
  for (const row of diagnostics) {
    const shouldBeSigned = row.field === "payload";
    if (row.signed !== shouldBeSigned) {
      return {
        ok: false,
        rejected: true,
        failure: UNSIGNED_HINT_NOT_AUTHORITY,
        offender: row,
      };
    }
  }
  return { ok: true, rejected: false, diagnostics };
}

export function markFieldSigned(
  field: MetadataDiagnostic["field"],
  signed: boolean,
):
  | { ok: true; field: MetadataDiagnostic["field"]; signed: boolean }
  | { ok: false; rejected: true; failure: typeof UNSIGNED_HINT_NOT_AUTHORITY } {
  if (field !== "payload" && signed) {
    return { ok: false, rejected: true, failure: UNSIGNED_HINT_NOT_AUTHORITY };
  }
  if (field === "payload" && signed === false) {
    return { ok: false, rejected: true, failure: UNSIGNED_HINT_NOT_AUTHORITY };
  }
  return { ok: true, field, signed };
}
