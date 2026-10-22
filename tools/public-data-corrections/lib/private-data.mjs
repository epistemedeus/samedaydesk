import { isPlainObject, pathKey, walk } from "./walk.mjs";

const EMAIL_RE =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const STREET_RE =
  /\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,6}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Way|Court|Ct\.?)\b/i;

const PRIVATE_KEYS = new Set([
  "email",
  "e-mail",
  "emailaddress",
  "customeremail",
  "address",
  "street",
  "streetaddress",
  "shippingaddress",
  "billingaddress",
  "mailingaddress",
  "homeaddress",
  "phone",
  "phonenumber",
  "mobile",
  "ssn",
  "ssnlast4",
  "customername",
  "fulllegalname",
]);

/**
 * Scan a packet for private customer data. Findings name shapes/keys only;
 * they never echo the matched email, address, or other PII.
 */
export function findPrivateData(packet) {
  const findings = [];
  walk(packet, (value, path) => {
    const key = pathKey(path).toLowerCase().replace(/[_-]/g, "");
    if (PRIVATE_KEYS.has(key) && value != null && value !== false && value !== "") {
      findings.push({ reason: `private-key:${pathKey(path)}` });
    }
    if (typeof value === "string") {
      if (EMAIL_RE.test(value)) findings.push({ reason: "email-shape" });
      if (STREET_RE.test(value)) findings.push({ reason: "street-address-shape" });
    }
  });
  const unique = [...new Set(findings.map((f) => f.reason))];
  return {
    privateData: unique.length > 0,
    reasons: unique,
  };
}

export function isSampleMarked(packet) {
  const reasons = [];
  if (packet?.sample === true || packet?.example === true || packet?.exampleMode === true) {
    reasons.push("sample-flag");
  }
  walk(packet, (value, path) => {
    if (!isPlainObject(value)) {
      if (typeof value === "string") {
        const key = pathKey(path);
        if (
          (key === "label" || key === "sampleLabel") &&
          value.trim().toUpperCase() === "SAMPLE"
        ) {
          reasons.push("label-SAMPLE");
        }
      }
      return;
    }
    if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") {
      reasons.push("label-SAMPLE");
    }
    if (value.exampleMode === true) reasons.push("exampleMode");
  });
  return { sample: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function isCustomerOwned(packet) {
  const ownership =
    packet?.ownership || packet?.owner || packet?.document?.ownership || null;
  if (packet?.customerOwned === true) return true;
  if (ownership === "customer-owned" || ownership === "customer") return true;
  return false;
}
