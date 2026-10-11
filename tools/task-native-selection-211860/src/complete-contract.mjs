export const COMPLETE_FEATURE = "codex/task-native-readiness-complete-211985";
export const COMPLETE_INPUT_SCHEMA = "samedaydesk.task-native-readiness-complete.input.v1";
export const COMPLETE_JOURNEY_SCHEMA = "samedaydesk.task-native-readiness-complete.v1";
export const CONTRACT_MODULE = "tools/l08-agent-repair/lib/readiness-contract.mjs";
export const STALE_PIN = "259ea74da295f12d64e2aae9cb2042c4a14c6b96";

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["quote"],
      properties: {
        quote: { type: "string" },
      },
    },
  },
};

function withQuote(quote) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: {
        type: "object",
        additionalProperties: false,
        required: ["quote"],
        properties: { quote },
      },
    },
  };
}

export const SUPPLIED_CONTRACT = Object.freeze({
  method: "POST",
  path: "/quote",
  requiredPaths: Object.freeze(["data.quote"]),
  valuePattern: "^\\d+(\\.\\d+)?$",
  valuePatternSource: "PRICE_PATTERN",
  schema: quoteSchema,
  conforming: { data: { quote: "1.25" } },
  wrong: { data: { quote: "soon" } },
  malformed: { data: { quote: 1.25 } },
  absentSchema: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          quote: { type: "string" },
        },
      },
    },
  },
  nullableSchema: withQuote({ type: "string", nullable: true }),
  enumSchema: withQuote({ type: "string", enum: ["1.25", "soon"] }),
  unsupportedSchema: { anyOf: [{ type: "object" }] },
});

const flags = Object.freeze({
  quoteGenerated: false,
  paymentSent: false,
  routeFetched: false,
  repairPosted: false,
});

function row(schema, semantic, nextAction) {
  return Object.freeze({ schema: Object.freeze(schema), semantic: Object.freeze(semantic), nextAction, ...flags });
}

const passSemantic = Object.freeze({ state: "pass", code: null, pointer: "data.quote", shape: "string" });
const stringMismatch = Object.freeze({ state: "fail", code: "value_mismatch", pointer: "data.quote", shape: "string" });
const schemaPass = Object.freeze({ state: "pass", code: null });

// Frozen before the pure module is invoked by the consumer. These are the
// semanticResult and classifySchema outcomes for the supplied bodies.
export const EXPECTED = Object.freeze({
  conforming: row(schemaPass, passSemantic, "decimal_match"),
  wrong: row(schemaPass, stringMismatch, "value_mismatch:data.quote"),
  malformed: row(schemaPass, { state: "fail", code: "value_mismatch", pointer: "data.quote", shape: "number" }, "value_mismatch:data.quote"),
  absentPath: row(
    { state: "fail", code: "seller_response_required_path_missing:data.quote" },
    passSemantic,
    "seller_response_required_path_missing:data.quote",
  ),
  nullable: row({ state: "fail", code: "type_not_guaranteed:data.quote" }, passSemantic, "type_not_guaranteed:data.quote"),
  enum: row({ state: "fail", code: "enum_not_guaranteed:data.quote" }, passSemantic, "enum_not_guaranteed:data.quote"),
  unsupported: row({ state: "fail", code: "schema_unsupported" }, passSemantic, "schema_unsupported"),
});
