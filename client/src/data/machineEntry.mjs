// Single authority for /for-agents and /x402 machine-entry copy.
// Route shells, the React pages, llms tests, and crawler HTML all read this file.
// Live paid HTTP/MCP counts are not literals here. Link the merchant inventories.

import DISTRIBUTION_REPAIR_KIT from "./distributionRepairKit.json" with { type: "json" };

export const SITE_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const MERCHANT_REPO = "https://github.com/epistemedeus/x402-url-extractor";
export const MERCHANT_PIN = "ef46e2b5213b9436e5cc4339a159c8ae837db880";
export const MERCHANT_INPUT_PIN = "f9dd59aeeb200881bc1313ed846ba002e7081258";
export const MERCHANT_INPUT_SHORT = "f9dd59ae";
export const CUSTOMER_EXAMPLE_VERSION = "0.2.3";
export const CUSTOMER_EXAMPLE_DIR = "examples/customer-x402";
export const RECURRING_MERCHANT_CONTRACTS = Object.freeze({
  C31: Object.freeze({
    label: "page-change compare",
    reportSchema: "pilot/page-change-brief/v1",
    httpProduct: "samedaydesk-page-change-http",
    httpSchema: "samedaydesk.page-change-http.v0",
    route: `${GATEWAY_ORIGIN}/recipes/page-change`,
    health: `${GATEWAY_ORIGIN}/recipes/page-change/health`,
    openapi: `${GATEWAY_ORIGIN}/recipes/page-change/openapi.json`,
    requiredFields: Object.freeze(["before", "after", "fields"]),
  }),
  C34: Object.freeze({
    label: "extract-batch record + skills discovery",
    product: "samedaydesk-extract-batch",
    schemaVersion: "samedaydesk.extract-batch.v0",
    skillsIndex: `${GATEWAY_ORIGIN}/.well-known/skills/index.json`,
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
  }),
});
export const EXPLICIT_RECORD_SKILL =
  `${MERCHANT_REPO}/blob/${MERCHANT_PIN}/plugins/samedaydesk-extract/skills/explicit-record/SKILL.md`;

export const LIVE_INVENTORY = Object.freeze([
  Object.freeze({
    label: "HTTP action catalog",
    href: `${GATEWAY_ORIGIN}/api/actions`,
  }),
  Object.freeze({
    label: "x402 resource manifest",
    href: `${GATEWAY_ORIGIN}/.well-known/x402`,
  }),
  Object.freeze({
    label: "Health, prices, and protocol route counts",
    href: `${GATEWAY_ORIGIN}/healthz`,
  }),
  Object.freeze({
    label: "Paid MCP",
    href: `${GATEWAY_ORIGIN}/mcp`,
  }),
  Object.freeze({
    label: "Gateway llms.txt",
    href: `${GATEWAY_ORIGIN}/llms.txt`,
  }),
  Object.freeze({
    label: "OpenAPI",
    href: `${GATEWAY_ORIGIN}/openapi.json`,
  }),
]);

export const OBSERVE_QUICKSTART = [
  `git clone ${MERCHANT_REPO}.git`,
  "cd x402-url-extractor",
  `git checkout ${MERCHANT_PIN}`,
  `cd ${CUSTOMER_EXAMPLE_DIR}`,
  "node --version # must report v22.x",
  "npm ci",
  "npm start",
].join("\n");

export const COMPARE_QUICKSTART = [
  "npm run page-change -- job --job ./fixtures/page-change/customer-job/job.json",
  "npm run page-change -- compare \\",
  "  --before ./fixtures/page-change/customer-job/before.json \\",
  "  --after ./fixtures/page-change/customer-job/after.json \\",
  "  --fields title,description,headings \\",
  "  --format text",
].join("\n");

export const RECORD_QUICKSTART = [
  "npm run record -- \\",
  "  --input ./fixtures/record/product-jsonld/delivery/extract-batch.json \\",
  "  --mapping ./fixtures/record/required-sku/mapping.json \\",
  "  --schema ./fixtures/record/required-sku/schema.json \\",
  "  --out /tmp/samedaydesk-record-required-sku",
].join("\n");

export const REUSE_QUICKSTART = [
  'NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
  "node tools/result-reuse/cli.mjs preview \\",
  "  --input tools/result-reuse/fixtures/accepted-page-change.json \\",
  '  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"',
  "node tools/result-reuse/cli.mjs export \\",
  "  --input tools/result-reuse/fixtures/accepted-page-change.json \\",
  '  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW" \\',
  "  --opt-in --out /tmp/samedaydesk-reuse-observation.json",
].join("\n");

export const RECURRING_QUICKSTART = [
  "# Required: --prior, --schedule, --clock, --fields; plus one of --current-fixture | --live-safe | --sources | --candidate | --issue-url | --issue-fixture",
  "node tools/recurring-job-recipes/cli.mjs --list",
  "node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \\",
  "  --prior tools/recurring-job-recipes/fixtures/priors/source-change.prior.json \\",
  "  --current-fixture tools/recurring-job-recipes/fixtures/current/example-unchanged.json \\",
  "  --fields title --schedule daily --clock 2026-09-09T16:00:00.000Z --horizon 168",
  "node tools/recurring-job-recipes/cli.mjs --recipe issue-to-work-brief \\",
  "  --prior tools/recurring-job-recipes/fixtures/priors/issue-brief.prior.json \\",
  "  --issue-url https://github.com/epistemedeus/samedaydesk/issues/1 \\",
  "  --schedule weekly --clock 2026-09-09T16:00:00.000Z",
  "node tools/recurring-job-recipes/cli.mjs --recipe buyer-setup-trace \\",
  "  --schedule once --clock 2026-09-09T16:00:00.000Z",
].join("\n");

export const BUYER_SETUP_QUICKSTART = [
  "# Live free inspection only. Stops at unpaid 402. Never signs. Never infers wallet ownership from payTo.",
  `# Local merchant: sibling x402-url-extractor (name x402-merchant) or MERCHANT_INPUT_ROOT. Pin ${MERCHANT_INPUT_SHORT}. No network clone.`,
  "node tools/recurring-job-recipes/cli.mjs --recipe buyer-setup-trace \\",
  "  --schedule once --clock \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" \\",
  "  --gateway-origin https://agents.samedaydesk.com",
].join("\n");

export const FOR_AGENTS_PATH = "/for-agents";
export const FOR_AGENTS_TITLE = "Practical agent jobs | SameDayDesk";
export const FOR_AGENTS_DESCRIPTION =
  "Obtain bounded observations, compare or record already-held JSON, then optionally export a reuse reference. Schema-valid export is user-selected unverified evidence. Purchasing never requires publishing.";
export const FOR_AGENTS_CANONICAL = `${SITE_ORIGIN}${FOR_AGENTS_PATH}`;

export const X402_PATH = "/x402";
export const X402_TITLE = "Agent Payment Infrastructure: x402 and MPP | SameDayDesk";
export const X402_DESCRIPTION =
  "Call SameDayDesk machine services with x402 or native MPP on Base. Live HTTP, MCP, and x402 inventories are authoritative. Practical jobs start at /for-agents.";
export const X402_CANONICAL = `${SITE_ORIGIN}${X402_PATH}`;

// Client-side navigation must update the same metadata as a direct route-shell load.
// Return a cleanup for React effects, including StrictMode's setup/cleanup replay.
export function applyMachineMetadata(document, shell) {
  const previousTitle = document.title;
  document.title = shell.title;
  const changes = [
    ['meta[name="description"]', 'content', shell.description],
    ['link[rel="canonical"]', 'href', shell.canonical],
    ['meta[property="og:url"]', 'content', shell.canonical],
    ['meta[property="og:title"]', 'content', shell.title],
    ['meta[property="og:description"]', 'content', shell.description],
    ['meta[name="twitter:title"]', 'content', shell.title],
    ['meta[name="twitter:description"]', 'content', shell.description],
  ].map(([selector, attribute, value]) => {
    const element = document.querySelector(selector);
    const previous = element?.getAttribute(attribute) ?? null;
    element?.setAttribute(attribute, value);
    return { element, attribute, previous };
  });
  return () => {
    document.title = previousTitle;
    for (const { element, attribute, previous } of changes) {
      if (previous === null) element?.removeAttribute(attribute);
      else element?.setAttribute(attribute, previous);
    }
  };
}

function inventoryListHtml() {
  return LIVE_INVENTORY.map((item) => `<li><a href="${item.href}">${item.label}</a></li>`).join("");
}

export const FOR_AGENTS_CRAWLER_HTML = `
      <h1>Obtain observations, use offline jobs, or opt-in reuse</h1>
      <p>
        SameDayDesk sells a bounded <code>POST /extract/batch</code> attempt: one to five public HTTPS
        URLs, caller-selected fields, 0.01 USDC. A later comparison of two already-held JSON
        artifacts is free, local, and does not fetch. Paid freshness and offline comparison stay
        distinct. Installation grants no payment authority.
      </p>
      <p>
        Current paid HTTP and MCP inventories live on the merchant. This page does not freeze a
        route count. Failed, partial, and missing rows stay visible. Observation freshness is unknown
        unless you supply a clock and a horizon. <code>charged: true</code> is not useful output.
        Current source labels are untrusted, not buyer proof. Purchasing never requires publishing
        or referrals.
      </p>
      <h2>Job 1. Obtain bounded extracted observations</h2>
      <p>
        Public customer example ${CUSTOMER_EXAMPLE_VERSION} at
        <a href="${MERCHANT_REPO}/tree/${MERCHANT_PIN}/${CUSTOMER_EXAMPLE_DIR}">${MERCHANT_REPO}/tree/${MERCHANT_PIN}/${CUSTOMER_EXAMPLE_DIR}</a>.
        Requires Node.js 22.x and a full Git checkout, not a packed tarball.
        Default commands are unpaid preflight against the live merchant, not an offline fixture. They
        sign nothing. Inspect and edit <code>fixtures/authorization-batch.json</code> yourself before any <code>--approve</code>
        purchase. Optional attempt receipt and read-only reconcile are separate.
        Reconcile an unknown payment outcome instead of automatically retrying. This page includes
        no keys, secret URLs, or purchase.
      </p>
      <pre><code>${OBSERVE_QUICKSTART}</code></pre>
      <p>
        Backward-compatible single URL: <code>GET ${GATEWAY_ORIGIN}/extract</code>. The practical
        multi-URL job is <code>POST ${GATEWAY_ORIGIN}/extract/batch</code>.
      </p>
      <h2>Job 2. Compare explicit fields from two already-held observations</h2>
      <p>
        From the same <code>${CUSTOMER_EXAMPLE_DIR}</code> directory after <code>npm ci</code>. The
        recipe does not fetch, pay, retry, or contact the merchant. Selected fields are required. An
        absent selected field is coverage unknown, not deletion. Reordered rows with the same
        source URL are order, not content change. Fixture output is owner proof, not buyer demand.
      </p>
      <pre><code>${COMPARE_QUICKSTART}</code></pre>
      <h2>Job 3. Map already-held JSON into buyer records</h2>
      <p>
        From the same pinned checkout and directory, the explicit-record CLI maps only buyer-named
        JSON Pointers and validates the result against the buyer's local JSON Schema. It does not
        fetch or infer. In the product and organization/contact examples, missing <code>sku</code>
        and <code>email</code> are optional. The command below is a separate truthful required-field
        example: it keeps one usable product record, labels the row missing required <code>sku</code>
        invalid, accounts for the failed source row, writes all three artifacts, and exits 1.
        <a href="${EXPLICIT_RECORD_SKILL}">Read the pinned explicit-record workflow</a>.
      </p>
      <pre><code>${RECORD_QUICKSTART}</code></pre>
      <h2>Job 4. Opt-in reuse of an already produced result</h2>
      <p>
        From a SameDayDesk checkout, preview exactly which fields would be copied into a
        <code>neomorphic.task-memory.observation.v1</code> reference, then write only with
        <code>--opt-in</code>. The helper does not fetch or pay. Default page-change and record
        outputs stay intact. The projection uses a reviewed allowlist, not a harmlessness guarantee.
        A schema-valid export is user-selected unverified evidence, never automatic public-safe certification.
        Private source text, authorization, receipt secrets, and legal or customer identifiers are
        omitted and cannot be selected. Failed and incomplete rows remain visible. The caller supplies
        stable task, subject, revision sequence, and current UTC clock values; the helper does not invent
        them. If an original evidence URL is missing, the export labels the recipe URL as a locator rather
        than evidence.
        Later task-memory import is a separate step.
      </p>
      <pre><code>${REUSE_QUICKSTART}</code></pre>
      <h2>Job 5. Recurring page, issue, and buyer-setup recipes</h2>
      <p>
        From a SameDayDesk checkout, run one-shot recurring recipes against an immutable prior.
        Operator supplies <code>--prior</code> (where required), <code>--schedule</code>,
        <code>--clock</code>, and an observation source. Primary developer-agent workflows are
        <code>source-change-alert</code> and <code>issue-to-work-brief</code>. Outcomes are
        unchanged, changed, partial, stale baseline, timed out, or error. Priors are never
        overwritten; write a new sequenced artifact after review. C31 page-change reports use
        <code>pilot/page-change-brief/v1</code> at
        <a href="${RECURRING_MERCHANT_CONTRACTS.C31.route}">${RECURRING_MERCHANT_CONTRACTS.C31.route}</a>.
        C34 extract-batch records use <code>${RECURRING_MERCHANT_CONTRACTS.C34.schemaVersion}</code>
        with skills at
        <a href="${RECURRING_MERCHANT_CONTRACTS.C34.skillsIndex}">${RECURRING_MERCHANT_CONTRACTS.C34.skillsIndex}</a>.
        <code>buyer-setup-trace</code> is live free inspection of the AgentCash/x402 runtime and
        stops at unpaid 402 without signing or inferring wallet ownership from addresses.
        Payment receipts are never automatically replayed.
        Optional local Neomorphic observation export stays filesystem-local when shared mode is
        undeployed. Offline runs avoid merchant charges; operator CPU and network remain
        costs_unknown. Listed batch price 0.01 USDC is not invoked here. No cron is installed.
        Owner QA issues are not demand.
      </p>
      <pre><code>${RECURRING_QUICKSTART}</code></pre>
      <pre><code>${BUYER_SETUP_QUICKSTART}</code></pre>
      <h2>Live merchant inventory</h2>
      <ul>
        ${inventoryListHtml()}
        <li><a href="${X402_CANONICAL}">Human storefront for other machine services</a></li>
        <li><a href="${SITE_ORIGIN}/x402/seller-conformance">Seller conformance proof</a></li>
        <li><a href="${SITE_ORIGIN}/x402/verified">Inspected x402 route list</a></li>
      </ul>
    `;

export const X402_CRAWLER_HTML = `
      <h1>Agents discover a service, call it, pay, and continue</h1>
      <p>
        SameDayDesk machine services settle exact Base USDC through x402 or native MPP. No API
        key, subscription, or account is required. Discovery is not authorization, settlement,
        demand, or revenue. Live catalogs are authoritative; this page does not freeze a tool count.
      </p>
      <p>
        Practical jobs live on
        <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>:
        paid bounded <code>POST /extract/batch</code> observations, free offline comparison and
        explicit buyer-record mapping, opt-in reuse of an already produced result, and one-shot
        recurring page or record recipes with immutable priors.
        Purchasing never requires publishing. Other named calls remain on the live inventory.
      </p>
      <ul>
        <li><a href="${FOR_AGENTS_CANONICAL}">Practical agent jobs</a></li>
        ${inventoryListHtml()}
        <li><a href="${SITE_ORIGIN}/x402/seller-conformance">Seller conformance proof</a></li>
        <li><a href="${SITE_ORIGIN}/x402/verified">Inspected x402 route list</a></li>
        <li><a href="${SITE_ORIGIN}/docs/x402-sdk/">x402 SDK integration reference</a></li>
      </ul>
    `;


export const RECORD_REPEAT_PATH = "/for-agents/record-repeat";
export const RECORD_REPEAT_TITLE = "Compare OpenAPI, prices, keyed CSV, and feeds offline | SameDayDesk";
export const RECORD_REPEAT_DESCRIPTION =
  "Download one portable package to compare OpenAPI used operations, price/unit rows, keyed CSV, and RSS/Atom feeds on local files. Labeled samples and next-run manifests included. The CLI does not fetch, charge, or schedule. Unsupported HTML and missing identity or units are refused.";
export const RECORD_REPEAT_CANONICAL = `${SITE_ORIGIN}${RECORD_REPEAT_PATH}`;
export const RECORD_REPEAT_ARCHIVE = "/kit/record-repeat-job-ab84d79b0272.tar.gz";
export const RECORD_REPEAT_ARCHIVE_SHA256 = "9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea";
export const RECORD_REPEAT_ARCHIVE_BYTES = 1253570;
export const RECORD_REPEAT_PARSER_PIN = "65ce1867f1b4339cc708bfb72a7d9a5942785632";
export const RECORD_REPEAT_RECIPE_PIN = "a022eb6352156dcdcdf2f8730931f5891bd01436";
export const RECORD_REPEAT_DISCOVERY = "/discovery/record-repeat.json";

export const RECORD_REPEAT_COLD_START = [
  `curl -fsSL -o record-repeat-job.tar.gz ${SITE_ORIGIN}${RECORD_REPEAT_ARCHIVE}`,
  "mkdir -p /tmp && tar -xzf record-repeat-job.tar.gz -C /tmp",
  "cd /tmp/record-repeat-job",
  "node bin/record-repeat.mjs sample --all",
].join("\n");

export const RECORD_REPEAT_FIRST_USE = [
  "node bin/record-repeat.mjs sample --recipe R-OPENAPI-PIN-IMPACT",
  "node bin/record-repeat.mjs sample --recipe R-PRICE-UNIT-CASE",
  "node bin/record-repeat.mjs sample --recipe R-CSV-KEYED-CHANGE",
  "node bin/record-repeat.mjs sample --recipe R-FEED-LIVE-NOCHANGE",
  "node bin/record-repeat.mjs sample --recipe R-PRICE-REFUSE-HTML",
].join("\n");

export const RECORD_REPEAT_REPEAT_USE = [
  "node bin/record-repeat.mjs sample --recipe R-OPENAPI-PIN-IMPACT --write-next-run ./next-run.json",
  "node bin/record-repeat.mjs run --from-next-run ./next-run.json \\",
  "  --before ./vendor/s163-record-recipes/sources/openapi/museum/before.yaml \\",
  "  --after ./vendor/s163-record-recipes/sources/openapi/museum/after.yaml \\",
  "  --used ./vendor/s163-record-recipes/sources/openapi/museum/used-ops.pin.json",
].join("\n");

export const RECORD_REPEAT_CRAWLER_HTML = `
      <h1>Compare OpenAPI ops, price rows, keyed CSV, and feeds offline</h1>
      <p>
        SameDayDesk publishes one portable package for four local source comparisons:
        OpenAPI used-operation impact, curated price/unit row change, keyed CSV drift,
        and RSS/Atom correction briefs. Parsers are pinned at
        <code>${RECORD_REPEAT_PARSER_PIN}</code>; recipes/sources at
        <code>${RECORD_REPEAT_RECIPE_PIN}</code>. Run labeled samples or your own before/after
        files with Node. The CLI reads local files only; it does not fetch, charge, or schedule.
        Unsupported HTML and missing identity or units are refused, not invented.
      </p>
      <p>
        Machine discovery:
        <a href="${SITE_ORIGIN}${RECORD_REPEAT_DISCOVERY}">${SITE_ORIGIN}${RECORD_REPEAT_DISCOVERY}</a>.
        Archive: <a href="${SITE_ORIGIN}${RECORD_REPEAT_ARCHIVE}">${SITE_ORIGIN}${RECORD_REPEAT_ARCHIVE}</a>
        (sha256 <code>${RECORD_REPEAT_ARCHIVE_SHA256}</code>). <a href="${SITE_ORIGIN}${RECORD_REPEAT_ARCHIVE}">Download archive</a>.
      </p>
      <h2>Cold start</h2>
      <pre><code>${RECORD_REPEAT_COLD_START}</code></pre>
      <h2>Labeled samples</h2>
      <pre><code>${RECORD_REPEAT_FIRST_USE}</code></pre>
      <h2>Repeat via next-run manifest</h2>
      <pre><code>${RECORD_REPEAT_REPEAT_USE}</code></pre>
      <p>
        Paid observation jobs remain on
        <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>.
      </p>
    `;

export const RECORD_REPEAT_SHELL = Object.freeze({
  path: RECORD_REPEAT_PATH,
  title: RECORD_REPEAT_TITLE,
  description: RECORD_REPEAT_DESCRIPTION,
  canonical: RECORD_REPEAT_CANONICAL,
  crawlerHtml: RECORD_REPEAT_CRAWLER_HTML,
});

export const DISTRIBUTION_REPAIR_PATH = "/for-agents/distribution-repair";
export const DISTRIBUTION_REPAIR_TITLE = "Diagnose why a listed tool cannot run | SameDayDesk";
export const DISTRIBUTION_REPAIR_DESCRIPTION =
  "Download one portable package that turns caller-supplied listing snapshots and a baseline/current route pair into an explainable diagnosis and owner repair guidance. Runs offline on the files you supply. Incomplete captures cannot prove a listing was removed everywhere.";
export const DISTRIBUTION_REPAIR_CANONICAL = `${SITE_ORIGIN}${DISTRIBUTION_REPAIR_PATH}`;
export const DISTRIBUTION_REPAIR_ARCHIVE = DISTRIBUTION_REPAIR_KIT.archive;
export const DISTRIBUTION_REPAIR_ARCHIVE_SHA256 = DISTRIBUTION_REPAIR_KIT.sha256;
export const DISTRIBUTION_REPAIR_ARCHIVE_BYTES = DISTRIBUTION_REPAIR_KIT.bytes;
export const DISTRIBUTION_REPAIR_DISCOVERY = DISTRIBUTION_REPAIR_KIT.discovery;
export const DISTRIBUTION_REPAIR_RECORD04_PIN = DISTRIBUTION_REPAIR_KIT.record04;
export const DISTRIBUTION_REPAIR_DIST08_PIN = DISTRIBUTION_REPAIR_KIT.dist08;
export const DISTRIBUTION_REPAIR_NL06_PIN = DISTRIBUTION_REPAIR_KIT.nl06;

export const DISTRIBUTION_REPAIR_COLD_START = [
  `curl -fsSL -o distribution-repair.tar.gz ${SITE_ORIGIN}${DISTRIBUTION_REPAIR_ARCHIVE}`,
  "mkdir -p /tmp && tar -xzf distribution-repair.tar.gz -C /tmp",
  "cd /tmp/distribution-repair",
  "node bin/distribution-repair.mjs sample --positive",
].join("\n");

export const DISTRIBUTION_REPAIR_FIRST_USE = [
  "node bin/distribution-repair.mjs schema",
  "node bin/distribution-repair.mjs diagnose ./examples/caller/alpha.json",
  "node bin/distribution-repair.mjs diagnose ./examples/caller/beta.json",
  "node bin/distribution-repair.mjs sample --partial",
  "node bin/distribution-repair.mjs sample --mismatch",
].join("\n");

export const DISTRIBUTION_REPAIR_REPEAT_USE = [
  "node bin/distribution-repair.mjs diagnose ./examples/positive.json --write-next-run ./next-run.json",
  "node bin/distribution-repair.mjs diagnose ./examples/next-run/input-after-docs-fix.json",
].join("\n");

export const DISTRIBUTION_REPAIR_CRAWLER_HTML = `
      <h1>Diagnose why a listed tool cannot run from your snapshots</h1>
      <p>
        SameDayDesk publishes one portable package that maps caller-supplied discovery/listing
        snapshots and a baseline/current route pair into an explainable diagnosis and owner
        repair guidance. Identity is <code>provider</code> / <code>jobRef</code> /
        <code>sharedEvidenceId</code>, never a filename. The CLI runs offline on the files you
        supply (or labeled samples). It does not call priced endpoints or change live listings.
        Incomplete captures cannot prove a listing was removed everywhere.
      </p>
      <p>
        Machine discovery:
        <a href="${SITE_ORIGIN}${DISTRIBUTION_REPAIR_DISCOVERY}">${SITE_ORIGIN}${DISTRIBUTION_REPAIR_DISCOVERY}</a>.
        <a href="${SITE_ORIGIN}${DISTRIBUTION_REPAIR_ARCHIVE}">Download archive</a>
        (sha256 <code>${DISTRIBUTION_REPAIR_ARCHIVE_SHA256}</code>).
        Source pins: <code>${DISTRIBUTION_REPAIR_RECORD04_PIN}</code>,
        <code>${DISTRIBUTION_REPAIR_DIST08_PIN}</code>,
        <code>${DISTRIBUTION_REPAIR_NL06_PIN}</code>.
      </p>
      <h2>Cold start</h2>
      <pre><code>${DISTRIBUTION_REPAIR_COLD_START}</code></pre>
      <h2>Caller-shaped inputs</h2>
      <pre><code>${DISTRIBUTION_REPAIR_FIRST_USE}</code></pre>
      <h2>Repeat after a route correction</h2>
      <pre><code>${DISTRIBUTION_REPAIR_REPEAT_USE}</code></pre>
      <p>
        Paid observation jobs remain on
        <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>.
      </p>
    `;

export const DISTRIBUTION_REPAIR_SHELL = Object.freeze({
  path: DISTRIBUTION_REPAIR_PATH,
  title: DISTRIBUTION_REPAIR_TITLE,
  description: DISTRIBUTION_REPAIR_DESCRIPTION,
  canonical: DISTRIBUTION_REPAIR_CANONICAL,
  crawlerHtml: DISTRIBUTION_REPAIR_CRAWLER_HTML,
});


export const FOR_AGENTS_SHELL = Object.freeze({
  path: FOR_AGENTS_PATH,
  title: FOR_AGENTS_TITLE,
  description: FOR_AGENTS_DESCRIPTION,
  canonical: FOR_AGENTS_CANONICAL,
  crawlerHtml: FOR_AGENTS_CRAWLER_HTML,
});

export const X402_SHELL = Object.freeze({
  path: X402_PATH,
  title: X402_TITLE,
  description: X402_DESCRIPTION,
  canonical: X402_CANONICAL,
  crawlerHtml: X402_CRAWLER_HTML,
});
