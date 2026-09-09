/**
 * Merchant contract pins for recurring recipes.
 * C31 = page-change compare (pilot/page-change-brief/v1).
 * C34 = extract-batch record + well-known skills discovery.
 */

export const MERCHANT_INPUT_REPO = "https://github.com/epistemedeus/x402-url-extractor";
export const MERCHANT_INPUT_PIN = "f9dd59aeeb200881bc1313ed846ba002e7081258";
export const MERCHANT_INPUT_SHORT = "f9dd59ae";

export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";

export const CONTRACTS = Object.freeze({
  C31: Object.freeze({
    id: "C31",
    label: "page-change compare",
    reportSchema: "pilot/page-change-brief/v1",
    httpProduct: "samedaydesk-page-change-http",
    httpSchema: "samedaydesk.page-change-http.v0",
    routes: Object.freeze({
      compare: "/recipes/page-change",
      health: "/recipes/page-change/health",
      openapi: "/recipes/page-change/openapi.json",
      verification: "/.well-known/xagent-verification.json",
    }),
    liveRoutes: Object.freeze({
      compare: `${GATEWAY_ORIGIN}/recipes/page-change`,
      health: `${GATEWAY_ORIGIN}/recipes/page-change/health`,
      openapi: `${GATEWAY_ORIGIN}/recipes/page-change/openapi.json`,
    }),
    requiredFields: Object.freeze(["before", "after", "fields"]),
    officialCli: Object.freeze({
      cwd: "examples/customer-x402",
      compare:
        "npm run page-change -- compare --before ./fixtures/page-change/customer-job/before.json --after ./fixtures/page-change/customer-job/after.json --fields title,description,headings",
    }),
  }),
  C34: Object.freeze({
    id: "C34",
    label: "extract-batch record + skills discovery",
    product: "samedaydesk-extract-batch",
    schemaVersion: "samedaydesk.extract-batch.v0",
    routes: Object.freeze({
      skillsIndex: "/.well-known/skills/index.json",
      pageChangeSkill: "/.well-known/skills/page-change/SKILL.md",
      explicitRecordSkill: "/.well-known/skills/explicit-record/SKILL.md",
    }),
    liveRoutes: Object.freeze({
      skillsIndex: `${GATEWAY_ORIGIN}/.well-known/skills/index.json`,
      pageChangeSkill: `${GATEWAY_ORIGIN}/.well-known/skills/page-change/SKILL.md`,
    }),
    requiredTopFields: Object.freeze([
      "ok",
      "product",
      "schemaVersion",
      "quote",
      "jobId",
      "jobStatus",
      "stopReason",
      "partial",
      "sources",
      "accounting",
      "costInputs",
      "charged",
      "boundary",
    ]),
    officialCli: Object.freeze({
      cwd: "examples/customer-x402",
      record:
        "npm run record -- --input ./fixtures/record/product-jsonld/delivery/extract-batch.json --mapping ./fixtures/record/required-sku/mapping.json --schema ./fixtures/record/required-sku/schema.json --out /tmp/samedaydesk-record-out",
    }),
  }),
});

export function discoveryLinks(origin = GATEWAY_ORIGIN) {
  return Object.freeze([
    Object.freeze({ contract: "C31", label: "Page-change health", href: `${origin}${CONTRACTS.C31.routes.health}` }),
    Object.freeze({ contract: "C31", label: "Page-change OpenAPI", href: `${origin}${CONTRACTS.C31.routes.openapi}` }),
    Object.freeze({ contract: "C34", label: "Well-known skills index", href: `${origin}${CONTRACTS.C34.routes.skillsIndex}` }),
    Object.freeze({ contract: "C34", label: "Page-change skill", href: `${origin}${CONTRACTS.C34.routes.pageChangeSkill}` }),
  ]);
}
