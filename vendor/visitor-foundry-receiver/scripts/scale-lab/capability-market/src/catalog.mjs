import {
  LAYERS,
  PRICE_SOURCE,
  ROUTE_KIND,
  SELLER_CLASS,
} from "./constants.mjs";

/**
 * Seed catalog: SameDayDesk useful job offerings + known Neomorphic lab capabilities.
 * Fixture-demo sellers are unmistakably labeled. No invented reviews or customers.
 *
 * Price observedAt values are fixture-clock facts for deterministic tests.
 * Freshness windows are short enough that tests can pin nowMs.
 */
export const FIXTURE_NOW = "2026-09-09T12:00:00.000Z";

export function createSeedCatalog({ nowIso = FIXTURE_NOW } = {}) {
  const now = Date.parse(nowIso);

  return [
    {
      id: "sdd-batch-extract-v0",
      title: "SameDayDesk bounded batch extraction",
      summary:
        "Extract structured fields from a bounded 1-5 public URL batch. Quote is an introductory flat USDC amount, not a per-URL success promise.",
      layer: LAYERS.ADVERTISED,
      outcomes: ["batch_extraction", "product_extract", "public_page_extract"],
      inputRequirements: {
        required: ["urls"],
        properties: {
          urls: { type: "array", maxItems: 5 },
          fields: { type: "array" },
        },
      },
      outputRequirements: {
        required: ["sources", "jobStatus"],
        properties: {
          sources: { type: "array" },
          jobStatus: { type: "string", enum: ["completed", "partial", "failed"] },
          quote: { type: "object" },
        },
      },
      price: {
        amount: "0.01",
        currency: "USDC",
        unit: "batch_1_to_5_urls",
        source: PRICE_SOURCE.SAMEDAYDESK_BATCH_QUOTE,
        observedAt: new Date(now - 60_000).toISOString(),
        freshnessMaxAgeSec: 86_400,
        note: "From samedaydesk.extract-batch.v0 quote meaning; not invented.",
      },
      executionRoute: {
        kind: ROUTE_KIND.EXTERNAL_COMPLETION,
        href: "https://samedaydesk.com/",
        label: "SameDayDesk merchant surface",
      },
      completionLink: {
        href: "https://samedaydesk.com/",
        label: "Complete or inspect on SameDayDesk",
      },
      seller: {
        class: SELLER_CLASS.OPERATOR,
        label: "SameDayDesk (Neomorphic LLC merchant brand)",
      },
      provenance: "samedaydesk",
      demo: false,
      runnableAdapterId: "local-fixture-batch-extract",
    },
    {
      id: "sdd-change-digest-v0",
      title: "SameDayDesk / lab change digest",
      summary:
        "Produce a dated digest of field-level differences on a cited public document. Reuses the private-trial change_digest job kind.",
      layer: LAYERS.ADVERTISED,
      outcomes: ["change_digest", "page_change", "record_change"],
      inputRequirements: {
        required: ["origin", "path"],
        properties: {
          origin: { type: "string" },
          path: { type: "string" },
          priorCitation: { type: "string" },
        },
      },
      outputRequirements: {
        required: ["digestMarkdown"],
        properties: {
          digestMarkdown: { type: "string" },
          citedUrls: { type: "array" },
        },
      },
      price: {
        amount: "preview",
        currency: "none",
        unit: "private_trial_brief",
        source: PRICE_SOURCE.NEOMORPHIC_LAB_TRIAL,
        observedAt: new Date(now - 120_000).toISOString(),
        freshnessMaxAgeSec: 86_400,
        note: "Preview / private trial; not a paid API.",
      },
      executionRoute: {
        kind: ROUTE_KIND.LOCAL_LAB,
        href: "/labs/trial/",
        label: "Private trial brief builder",
      },
      completionLink: {
        href: "/labs/trial/#example=change-digest",
        label: "Open change-digest trial example",
      },
      seller: {
        class: SELLER_CLASS.OPERATOR,
        label: "Neomorphic public laboratory",
      },
      provenance: "neomorphic-lab",
      demo: false,
      runnableAdapterId: null,
    },
    {
      id: "lab-record-projection",
      title: "Local record-lab projection",
      summary:
        "Project extraction JSON into a local record view with provenance. Worker-local; no upload.",
      layer: LAYERS.RUNNABLE,
      outcomes: ["record_projection", "structured_data_normalization", "extraction_inspect"],
      inputRequirements: {
        required: ["extractionJson"],
        properties: {
          extractionJson: { type: "string" },
        },
      },
      outputRequirements: {
        required: ["projectionSummary"],
        properties: {
          projectionSummary: { type: "string" },
          provenanceNotes: { type: "array" },
        },
      },
      price: {
        amount: "0",
        currency: "none",
        unit: "local_browser",
        source: PRICE_SOURCE.NEOMORPHIC_LAB_TRIAL,
        observedAt: new Date(now - 30_000).toISOString(),
        freshnessMaxAgeSec: 86_400,
        note: "Local lab surface; no charge and no upload.",
      },
      executionRoute: {
        kind: ROUTE_KIND.LOCAL_LAB,
        href: "/labs/record-lab/",
        label: "Record lab",
      },
      completionLink: {
        href: "/labs/record-lab/",
        label: "Open record lab",
      },
      seller: {
        class: SELLER_CLASS.OPERATOR,
        label: "Neomorphic public laboratory",
      },
      provenance: "neomorphic-lab",
      demo: false,
      runnableAdapterId: "local-record-lab-handoff",
    },
    {
      id: "lab-interface-change",
      title: "Local OpenAPI / MCP interface diff",
      summary:
        "Diff two local interface documents in-browser. No network fetch of arbitrary URLs.",
      layer: LAYERS.RUNNABLE,
      outcomes: ["interface_diff", "openapi_diff", "mcp_diff"],
      inputRequirements: {
        required: ["leftDocument", "rightDocument"],
        properties: {
          leftDocument: { type: "string" },
          rightDocument: { type: "string" },
        },
      },
      outputRequirements: {
        required: ["diffSummary"],
        properties: {
          diffSummary: { type: "string" },
        },
      },
      price: {
        amount: "0",
        currency: "none",
        unit: "local_browser",
        source: PRICE_SOURCE.NEOMORPHIC_LAB_TRIAL,
        observedAt: new Date(now - 30_000).toISOString(),
        freshnessMaxAgeSec: 86_400,
        note: "Local lab surface; no charge and no upload.",
      },
      executionRoute: {
        kind: ROUTE_KIND.LOCAL_LAB,
        href: "/labs/interface-change/",
        label: "Interface-change trial",
      },
      completionLink: {
        href: "/labs/interface-change/",
        label: "Open interface-change lab",
      },
      seller: {
        class: SELLER_CLASS.OPERATOR,
        label: "Neomorphic public laboratory",
      },
      provenance: "neomorphic-lab",
      demo: false,
      runnableAdapterId: "local-interface-change-handoff",
    },
    {
      id: "lab-seller-conformance",
      title: "Seller Conformance reviewed report",
      summary:
        "Fixed-scope public seller-route examination with human-reviewed report. Price from the published Neomorphic service record.",
      layer: LAYERS.ADVERTISED,
      outcomes: ["seller_conformance", "buyability_review"],
      inputRequirements: {
        required: ["methodPath"],
        properties: {
          methodPath: { type: "string" },
          origin: { type: "string" },
        },
      },
      outputRequirements: {
        required: ["report"],
        properties: {
          report: { type: "object" },
          evidenceDigest: { type: "string" },
        },
      },
      price: {
        amount: "490.00",
        currency: "USD",
        unit: "fixed_public_scope",
        source: PRICE_SOURCE.NEOMORPHIC_SERVICE,
        observedAt: new Date(now - 90_000).toISOString(),
        freshnessMaxAgeSec: 604_800,
        note: "$490 fixed public scope from services record; larger scopes quoted separately.",
      },
      executionRoute: {
        kind: ROUTE_KIND.EXTERNAL_COMPLETION,
        href: "/services/seller-conformance/",
        label: "Seller Conformance service page",
      },
      completionLink: {
        href: "/services/seller-conformance/fixed-scope/",
        label: "Fixed-scope checkout path",
      },
      seller: {
        class: SELLER_CLASS.OPERATOR,
        label: "Neomorphic LLC",
      },
      provenance: "neomorphic-service",
      demo: false,
      runnableAdapterId: null,
    },
    {
      id: "fixture-demo-echo",
      title: "FIXTURE DEMO capability echo",
      summary:
        "Demo-only adapter that echoes validated inputs as delivered evidence. Not a live seller.",
      layer: LAYERS.RUNNABLE,
      outcomes: ["demo_echo", "fixture_smoke"],
      inputRequirements: {
        required: ["message"],
        properties: {
          message: { type: "string" },
        },
      },
      outputRequirements: {
        required: ["echo", "evidenceClass"],
        properties: {
          echo: { type: "string" },
          evidenceClass: { type: "string" },
        },
      },
      price: {
        amount: "0",
        currency: "none",
        unit: "fixture",
        source: PRICE_SOURCE.FIXTURE_DEMO,
        observedAt: new Date(now - 10_000).toISOString(),
        freshnessMaxAgeSec: 3_600,
        note: "Fixture demo price; not a live offer.",
      },
      executionRoute: {
        kind: ROUTE_KIND.FIXTURE_DEMO,
        href: "/lab/capabilities/#fixture-demo-echo",
        label: "Local fixture adapter",
      },
      completionLink: {
        href: "/lab/capabilities/#fixture-demo-echo",
        label: "Run fixture echo in this page",
      },
      seller: {
        class: SELLER_CLASS.FIXTURE_DEMO,
        label: "FIXTURE DEMO seller (not a live merchant)",
      },
      provenance: "fixture",
      demo: true,
      runnableAdapterId: "fixture-demo-echo",
    },
  ];
}
