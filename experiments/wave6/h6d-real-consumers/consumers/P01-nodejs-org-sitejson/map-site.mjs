/**
 * Caller-owned mapping from nodejs/nodejs.org apps/site/site.json onto
 * page-change-offline-job SUPPORTED_FIELDS. Not equivalent to HTML extract.
 * Does not fetch, pay, or import kit engines.
 */

export const SELECTED_FIELDS = Object.freeze([
  "title",
  "description",
  "text",
  "jsonLd",
  "headings",
]);

export const SOURCE_KEY = "nodejs.org/apps/site/site.json";
export const EXTRACT_PRODUCT = "samedaydesk-extract-batch";
export const EXTRACT_SCHEMA = "samedaydesk.extract-batch.v0";
export const CLOCK = "2026-09-12T12:00:00.000Z";

function bannerOf(site) {
  return site?.websiteBanners?.index ?? null;
}

function badgeOf(site) {
  return site?.websiteBadges?.index ?? null;
}

export function mapSiteToSelected(site) {
  if (!site || typeof site !== "object") {
    throw new Error("site.json must be an object");
  }
  const banner = bannerOf(site);
  const badge = badgeOf(site);
  const textParts = [banner?.text, badge?.title, badge?.text].filter(
    (part) => typeof part === "string" && part.length,
  );
  const h2 = [banner?.text, badge?.title].filter(
    (part) => typeof part === "string" && part.length,
  );
  const hasPart = [];
  if (banner) {
    hasPart.push({
      "@type": "WebPageElement",
      name: "index-banner",
      text: banner.text ?? null,
      url: banner.link ?? null,
      startDate: banner.startDate ?? null,
      endDate: banner.endDate ?? null,
    });
  }
  if (badge) {
    hasPart.push({
      "@type": "WebPageElement",
      name: "index-badge",
      headline: badge.title ?? null,
      text: badge.text ?? null,
      url: badge.link ?? null,
      startDate: badge.startDate ?? null,
      endDate: badge.endDate ?? null,
    });
  }
  return {
    title: site.title,
    description: site.description,
    text: textParts.join("\n"),
    headings: {
      h1: typeof site.title === "string" ? [site.title] : [],
      h2,
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.title ?? null,
      description: site.description ?? null,
      hasPart,
    },
  };
}

export function wrapExtractBatch({
  site,
  jobId,
  observedAt,
  gitSha,
  blobSha,
  byteLength,
  sha256,
}) {
  const data = mapSiteToSelected(site);
  const bytes = Number(byteLength) || 0;
  return {
    ok: true,
    product: EXTRACT_PRODUCT,
    schemaVersion: EXTRACT_SCHEMA,
    quote: {
      amountAtomic: "0",
      displayUsdc: "0.00",
      meaning:
        "Caller-owned held extract-batch wrapper over official GitHub site.json bytes. Not a live fetch, quote-as-success, or payment.",
    },
    jobId,
    jobStatus: "completed",
    stopReason: null,
    partial: false,
    sources: [
      {
        id: "item-001",
        source: SOURCE_KEY,
        status: "success",
        data,
        notes: [
          "Caller-owned mapping of site.json title/description plus banner/badge copy onto selected fields. Not a live page fetch.",
        ],
        error: null,
        provenance: {
          transport: "held-github-contents",
          requestedAt: observedAt,
          completedAt: observedAt,
          fetchedAt: observedAt,
          gitSha,
          blobSha,
          path: "apps/site/site.json",
          byteLength: bytes,
          sha256,
          note: "Observation timestamps record when this wrapper was produced from held GitHub bytes. They are not page-content freshness.",
        },
      },
    ],
    accounting: {
      requests: 1,
      bytes,
      wallMs: 0,
      retries: 0,
      succeeded: 1,
      partial: 0,
      failed: 0,
      unknown: 0,
      skippedDuplicate: 0,
    },
    costInputs: {
      admittedBodyBytes: bytes,
      requests: 1,
      wallMs: 0,
      hostingCosts: "none",
      modelCosts: "none",
      monetaryMargin: null,
      note: "Held GitHub contents extraction; not socket billing.",
    },
    charged: false,
    boundary: {
      guaranteedUrlSuccess: false,
      introductoryPrice: false,
      sourceFetchBeforeAuthorization: false,
      automaticRetries: false,
    },
  };
}

export function jobDocument({ id, title, before, after, clock = CLOCK, fields = SELECTED_FIELDS }) {
  return {
    id,
    title,
    clock,
    fields: [...fields],
    before,
    after,
    purchaseAuthority: false,
  };
}
