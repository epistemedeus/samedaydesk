export const EVIDENCE_CLASSES = Object.freeze(["owner_qa", "independent", "recruited", "unknown"]);

export const OWNER_IDENTITIES = Object.freeze([
  "pack-operator",
  "owner",
  "operator",
  "samedaydesk-owner",
  "e3-pack",
]);

export function isOwnerIdentity(value) {
  if (value == null || value === "") return true;
  return OWNER_IDENTITIES.includes(String(value).trim().toLowerCase());
}

export function normalizeEvidenceClass(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return EVIDENCE_CLASSES.includes(trimmed) ? trimmed : trimmed;
}

export function isAllowedEvidenceClass(value) {
  return EVIDENCE_CLASSES.includes(value);
}
