import { heldExtractBatch, jobIdFor, sourceRow } from "./held-batch.mjs";
import { CLOCK } from "./paths.mjs";

export const LEADERBOARD_SOURCE = "https://samedaydesk.com/reports/ai-search-readiness-leaderboard-2026.html";
export const VALIDATOR_SOURCE = "https://samedaydesk.com/tools/schema-validator.html";

const LEADERBOARD_LINKS = Object.freeze([
  { href: "https://samedaydesk.com/tools/ai-readiness", text: "check your own site" },
  { href: "https://samedaydesk.com/tools/ai-readiness", text: "Run the free check" },
  { href: "https://buy.stripe.com/28E5kE9465np2OPh2WeZ20e", text: "Get the Fix Pack · $39" },
  { href: "https://samedaydesk.com/reports/ai-search-readiness-saas-2026.html", text: "SaaS" },
  { href: "https://samedaydesk.com/reports/ai-search-readiness-ecommerce-2026.html", text: "e-commerce" },
  { href: "https://samedaydesk.com/reports/ai-search-readiness-marketing-agencies-2026.html", text: "marketing agencies" },
  { href: "https://samedaydesk.com/reports/ai-search-readiness-ai-startups-2026.html", text: "AI startups" },
  { href: "https://samedaydesk.com/", text: "SameDayDesk" },
  { href: "https://samedaydesk.com/tools/free-seo-ai-tools.html", text: "free SEO & AI-search tools" },
]);

const VALIDATOR_LINKS = Object.freeze([
  { href: "https://samedaydesk.com/tools/ai-readiness", text: "Run the free AI-readiness check first" },
  { href: "https://buy.stripe.com/28E5kE9465np2OPh2WeZ20e", text: "Get the Fix Pack · $39" },
  { href: "https://samedaydesk.com/tools/schema-generator.html", text: "Generate schema" },
  { href: "https://samedaydesk.com/", text: "SameDayDesk" },
  { href: "https://samedaydesk.com/tools/schema-generator.html", text: "JSON-LD generator" },
  { href: "https://samedaydesk.com/tools/ai-crawler-checker.html", text: "AI crawler checker" },
  { href: "https://samedaydesk.com/tools/meta-tag-generator.html", text: "meta tag generator" },
]);

export const PAGES = {
  leaderboard136: {
    provenance: {
      gitShow: "git show c26fcd30395fd5a9be835458578d6eef65950857:client/public/reports/ai-search-readiness-leaderboard-2026.html",
      sha: "c26fcd30395fd5a9be835458578d6eef65950857",
      fetchedAt: "2026-06-23T22:52:27.000Z",
    },
    source: LEADERBOARD_SOURCE,
    data: {
      title: "AI-Search Readiness Leaderboard 2026 — 136 companies scored across 7 industries",
      description:
        "A sortable leaderboard of how 136 well-known companies score on AI-search readiness (ChatGPT, Perplexity, Google AI) across 7 industries — SaaS, e-commerce, agencies, AI startups, dev tools, fintech, healthtech. Healthtech and fintech score worst; GitHub got a D, Klarna an F. Filter, sort, free checker.",
      headings: {
        h1: ["AI-Search Readiness Leaderboard 2026"],
        h2: ["Average score by industry", "Where does your site rank?"],
      },
      canonical: LEADERBOARD_SOURCE,
      links: LEADERBOARD_LINKS,
    },
  },
  leaderboard189: {
    provenance: {
      gitShow: "git show 4d1ba68dc751bb1a23bb32aa28613884785e7139:client/public/reports/ai-search-readiness-leaderboard-2026.html",
      sha: "4d1ba68dc751bb1a23bb32aa28613884785e7139",
      fetchedAt: "2026-06-24T01:44:58.000Z",
    },
    source: LEADERBOARD_SOURCE,
    data: {
      title: "AI-Search Readiness Leaderboard 2026 — 189 companies scored across 10 industries",
      description:
        "A sortable leaderboard of how 189 well-known companies score on AI-search readiness (ChatGPT, Perplexity, Google AI) across 10 industries. Healthtech, media, and consumer apps score worst; GitHub and OpenAI got a D, Klarna and Ars Technica an F. Filter, sort, free checker.",
      headings: {
        h1: ["AI-Search Readiness Leaderboard 2026"],
        h2: ["Average score by industry", "Where does your site rank?"],
      },
      canonical: LEADERBOARD_SOURCE,
      links: LEADERBOARD_LINKS,
    },
  },
  validator4052: {
    provenance: {
      gitShow: "git show 4052f0fbf41c8b48823c6a3d58b6cd89c715abe1:client/public/tools/schema-validator.html",
      sha: "4052f0fbf41c8b48823c6a3d58b6cd89c715abe1",
      fetchedAt: "2026-07-06T07:03:09.000Z",
    },
    source: VALIDATOR_SOURCE,
    data: {
      title: "Free JSON-LD / Schema Validator: check your structured data for AI search | SameDayDesk",
      description:
        "Paste your JSON-LD structured data to validate it: catches JSON syntax errors, missing @context/@type, and missing recommended fields for common schema types (Organization, Product, FAQPage, Article, LocalBusiness). Free, no signup, instant.",
      headings: {
        h1: ["JSON-LD / Schema Validator"],
        h2: ["Want valid structured data installed on your real pages?"],
      },
      canonical: VALIDATOR_SOURCE,
      links: VALIDATOR_LINKS,
    },
  },
  validator374a: {
    provenance: {
      gitShow: "git show 374a565784bcd4ec89eeda7fedbb9610fed77473:client/public/tools/schema-validator.html",
      sha: "374a565784bcd4ec89eeda7fedbb9610fed77473",
      fetchedAt: "2026-09-02T11:18:42.000Z",
    },
    source: VALIDATOR_SOURCE,
    data: {
      title: "Free JSON-LD Validator & Schema Checker | SameDayDesk",
      description:
        "Paste JSON-LD to check JSON syntax, @context, @type, and recommended fields for common Schema.org types. Runs in your browser. Free, no signup.",
      headings: {
        h1: ["Free JSON-LD Validator & Schema Checker"],
        h2: ["Want valid structured data installed on your real pages?"],
      },
      canonical: VALIDATOR_SOURCE,
      links: VALIDATOR_LINKS,
    },
  },
};

function pageBatch(pageKey, { jobId, data, fetchedAt, extraSources } = {}) {
  const page = PAGES[pageKey];
  return heldExtractBatch({
    jobId: jobId ?? jobIdFor(`${pageKey}:${page.provenance.sha}`),
    source: page.source,
    data: data ?? page.data,
    fetchedAt: fetchedAt ?? page.provenance.fetchedAt,
    extraSources,
  });
}

function withoutCanonical(data) {
  const { canonical, ...rest } = data;
  return rest;
}

function whitespaceTitle(title) {
  return title.replace("189 companies", "189  companies");
}

const commonHonesty = {
  engineVersion: "0.1.1",
  claimsFresh: false,
  paymentImpliesUsefulOutput: false,
  networkUsed: false,
};

export const CASES = [
  {
    id: "number-date-status-leaderboard",
    title: "Real leaderboard 136→189 companies / 7→10 industries / grade-status copy",
    fields: ["title", "description", "headings"],
    extraArgs: [],
    before: () => pageBatch("leaderboard136"),
    after: () => pageBatch("leaderboard189"),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "changed",
      requiredPaths: ["/title", "/description"],
      forbiddenPaths: ["/headings", "/headings/h1", "/headings/h2", "/links"],
      tokenPairs: [
        { kind: "number", before: "136", after: "189" },
        { kind: "number", before: "7", after: "10" },
        { kind: "status", before: "Healthtech and fintech score worst", after: "Healthtech, media, and consumer apps score worst" },
        { kind: "status", before: "Klarna an F", after: "Klarna and Ars Technica an F" },
      ],
      unchangedDateToken: "2026",
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: false,
        complete: true,
        noChangeProven: false,
        comparable: true,
        fresh: false,
        paymentImpliesUsefulOutput: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "headings-omit-company-count",
    title: "Selected headings omit the 136→189 title number; honest unchanged, not a silent miss of a selected fact",
    fields: ["headings"],
    extraArgs: [],
    before: () => pageBatch("leaderboard136"),
    after: () => pageBatch("leaderboard189"),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "unchanged",
      requiredPaths: [],
      forbiddenPaths: ["/title", "/description"],
      tokenPairs: [],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: true,
        complete: true,
        noChangeProven: true,
        comparable: true,
        fresh: false,
      },
      note: "Unselected title numbers are not a bug. Field choice left the company-count fact out.",
      ...commonHonesty,
    },
  },
  {
    id: "nav-price-unselected",
    title: "Identical $39 Fix Pack and nav links on the leaderboard pair; selecting only links is unchanged",
    fields: ["links"],
    extraArgs: [],
    before: () => pageBatch("leaderboard136"),
    after: () => pageBatch("leaderboard189"),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "unchanged",
      requiredPaths: [],
      forbiddenPaths: ["/title", "/description"],
      tokenPairs: [],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: true,
        complete: true,
        noChangeProven: true,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "whitespace-title",
    title: "Caller-owned extra space in the 189 title is noise, not a number/date/status fact",
    fields: ["title", "description"],
    extraArgs: [],
    before: () => pageBatch("leaderboard189"),
    after: () => {
      const page = PAGES.leaderboard189;
      return pageBatch("leaderboard189", {
        jobId: jobIdFor("whitespace-title-after"),
        data: { ...page.data, title: whitespaceTitle(page.data.title) },
      });
    },
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "unchanged",
      requiredPaths: [],
      forbiddenPaths: ["/title"],
      tokenPairs: [],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: true,
        complete: true,
        noChangeProven: true,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "nav-links-reorder",
    title: "Caller-owned reverse of schema-validator links is order noise, not a semantic replace",
    fields: ["links"],
    extraArgs: [],
    before: () => pageBatch("validator374a"),
    after: () => {
      const page = PAGES.validator374a;
      return pageBatch("validator374a", {
        jobId: jobIdFor("nav-links-reorder-after"),
        data: { ...page.data, links: [...page.data.links].reverse() },
      });
    },
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "reordered",
      requiredPaths: ["/links"],
      changeClass: "order",
      forbiddenSemantic: true,
      tokenPairs: [],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: true,
        complete: true,
        noChangeProven: false,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "missing-canonical",
    title: "Selected canonical absent from both held captures is coverage-unknown, not a deletion",
    fields: ["title", "canonical"],
    extraArgs: [],
    before: () => pageBatch("leaderboard189", {
      jobId: jobIdFor("missing-canonical-before"),
      data: withoutCanonical(PAGES.leaderboard189.data),
    }),
    after: () => pageBatch("leaderboard189", {
      jobId: jobIdFor("missing-canonical-after"),
      fetchedAt: "2026-06-24T01:45:00.000Z",
      data: withoutCanonical(PAGES.leaderboard189.data),
    }),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "incomplete",
      requiredPaths: [],
      forbiddenOps: ["add", "replace"],
      coverageField: "canonical",
      coverageReason: "absent_field_is_coverage_unknown_not_deletion",
      tokenPairs: [],
      claims: {
        usefulOutputProven: false,
        contentUnchangedProven: false,
        complete: false,
        noChangeProven: false,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "failed-capture",
    title: "After row status=failure is incomplete/failed, not a silent deletion of 189 companies",
    fields: ["title", "description"],
    extraArgs: [],
    before: () => pageBatch("leaderboard136"),
    after: () => heldExtractBatch({
      jobId: jobIdFor("failed-capture-after"),
      source: LEADERBOARD_SOURCE,
      data: null,
      fetchedAt: PAGES.leaderboard189.provenance.fetchedAt,
      status: "failure",
      error: { message: "held capture failed; not a live retry" },
    }),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "incomplete",
      requiredPaths: [],
      failedSource: LEADERBOARD_SOURCE,
      tokenPairs: [],
      claims: {
        usefulOutputProven: false,
        contentUnchangedProven: false,
        complete: false,
        noChangeProven: false,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "identical-replay",
    title: "Same 189 selected fields twice; jobId/timestamp noise is not a page change",
    fields: ["title", "description", "headings"],
    extraArgs: [],
    before: () => pageBatch("leaderboard189"),
    after: () => pageBatch("leaderboard189", {
      jobId: jobIdFor("identical-replay-after"),
      fetchedAt: "2026-06-24T01:46:00.000Z",
    }),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "unchanged",
      requiredPaths: [],
      forbiddenPaths: ["/title", "/description", "/headings"],
      tokenPairs: [],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: true,
        complete: true,
        noChangeProven: true,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "ambiguous-duplicate-source",
    title: "Duplicate source identity with conflicting titles must be ambiguous, not one silent replace",
    fields: ["title"],
    extraArgs: [],
    before: () => pageBatch("leaderboard136"),
    after: () => heldExtractBatch({
      jobId: jobIdFor("ambiguous-after"),
      source: LEADERBOARD_SOURCE,
      data: PAGES.leaderboard189.data,
      fetchedAt: PAGES.leaderboard189.provenance.fetchedAt,
      extraSources: [
        sourceRow({
          id: "item-002",
          source: LEADERBOARD_SOURCE,
          data: {
            ...PAGES.leaderboard189.data,
            title: "AI-Search Readiness Leaderboard 2026 — 92 companies scored (SaaS, e-commerce, agencies, AI startups)",
          },
          fetchedAt: PAGES.leaderboard189.provenance.fetchedAt,
        }),
      ],
    }),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "ambiguous",
      requiredPaths: [],
      duplicateSource: LEADERBOARD_SOURCE,
      silentReplaceForbidden: true,
      tokenPairs: [],
      claims: {
        usefulOutputProven: false,
        contentUnchangedProven: false,
        complete: false,
        noChangeProven: false,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "schema-validator-in-bounds",
    title: "Real schema-validator title/description/h1 rewrite is changed with those paths",
    fields: ["title", "description", "headings"],
    extraArgs: [],
    before: () => pageBatch("validator4052"),
    after: () => pageBatch("validator374a"),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "changed",
      requiredPaths: ["/title", "/description", "/headings/h1"],
      forbiddenPaths: ["/headings/h2", "/links"],
      tokenPairs: [
        { kind: "status", before: "JSON-LD / Schema Validator", after: "JSON-LD Validator & Schema Checker" },
      ],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: false,
        complete: true,
        noChangeProven: false,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
  {
    id: "max-changes-omits-sibling",
    title: "Shipped --max-changes 1 must declare the omitted sibling; not a complete two-field watch",
    fields: ["title", "description", "headings"],
    extraArgs: ["--max-changes", "1"],
    before: () => pageBatch("validator4052"),
    after: () => pageBatch("validator374a"),
    expected: {
      transportOk: true,
      exitCode: 0,
      verdict: "changed",
      maxChanges: 1,
      complete: false,
      limitsHit: "maxChanges",
      requiredPaths: [],
      tokenPairs: [],
      claims: {
        usefulOutputProven: true,
        contentUnchangedProven: false,
        complete: false,
        noChangeProven: false,
        comparable: true,
        fresh: false,
      },
      ...commonHonesty,
    },
  },
];

export function jobDocument(caseDef) {
  return {
    id: caseDef.id,
    title: caseDef.title,
    clock: CLOCK,
    fields: caseDef.fields,
    before: "./before.json",
    after: "./after.json",
  };
}

export { CLOCK };
