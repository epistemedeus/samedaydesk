export {
  SCHEMA,
  SCHEMA_VERSION,
  OUTPUT_JSON,
  OUTPUT_MD,
  APP_ID,
} from "./paths.mjs";
export { classifyPair, fingerprintSchemaNode, fingerprintUsedNode } from "./compare.mjs";

export const IMPACT_CLASSES = Object.freeze([
  "breaking",
  "compatible",
  "added",
  "deleted",
  "unchanged",
  "informational",
  "unknown",
]);

export const CLASSIFICATION_REASONS = Object.freeze({
  typeChange: "type-change",
  requiredAdded: "required-added",
  requiredRemoved: "required-removed",
  requiredChanged: "required-changed",
  numericTightened: "numeric-tightened",
  numericWeakened: "numeric-weakened",
  numericIncomparable: "numeric-incomparable",
  booleanSchemaTightened: "boolean-schema-tightened",
  booleanSchemaWeakened: "boolean-schema-weakened",
  additionalPropertiesTightened: "additionalProperties-tightened",
  additionalPropertiesWeakened: "additionalProperties-weakened",
  structuralChange: "structural-change",
  structuralEqual: "structural-equal",
  absentInBoth: "absent-in-both",
});
