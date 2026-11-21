// Single authority for /for-agents and /x402 machine-entry copy.
// Route shells, the React pages, llms tests, and crawler HTML all read this file.
// Live paid HTTP/MCP counts are not literals here. Link the merchant inventories.

import DISTRIBUTION_REPAIR_KIT from "./distributionRepairKit.json" with { type: "json" };
import CONSUMER_REPEAT_KIT from "./consumerRepeatKit.json" with { type: "json" };
import USEFUL_JOBS_KIT from "./usefulJobsKit.json" with { type: "json" };

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
export const FOR_AGENTS_TITLE = "Fresh web data for agents, 0.01 USDC a batch | SameDayDesk";
export const FOR_AGENTS_DESCRIPTION =
  "Your agent sends up to five web pages and the fields it wants and gets clean JSON back: 0.01 USDC a batch over x402, no key or account. Free local tools compare, map and reuse the results.";
export const FOR_AGENTS_CANONICAL = `${SITE_ORIGIN}${FOR_AGENTS_PATH}`;

export const X402_PATH = "/x402";
export const X402_TITLE = "Agent Payment Infrastructure: x402 and MPP | SameDayDesk";
export const X402_DESCRIPTION =
  "Web data and checks your AI agent can buy one call at a time: read the web, check a payment or seller, company and wallet profiles, lending positions on Base. From 0.002 USDC per call over x402 or MPP, no account or key.";
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
      <h1>Fresh web data for your agent, and free tools to use it</h1>
      <p>
        Your agent sends up to five public web pages and the fields it wants to <code>POST /extract/batch</code>, and gets them back as clean JSON. 0.01 USDC a batch, paid per call with x402: no key, account or subscription. Comparing, mapping and reusing what you already fetched is free and runs on your own machine.
      </p>
      <p>
        Every page you asked for comes back with a row, including the ones that failed, so your agent always knows what it has. The full list of paid HTTP and MCP tools is on the live gateway, linked below.
      </p>
      <h2>Job 1. Fetch fields from up to five pages</h2>
      <p>
        Public customer example ${CUSTOMER_EXAMPLE_VERSION} at
        <a href="${MERCHANT_REPO}/tree/${MERCHANT_PIN}/${CUSTOMER_EXAMPLE_DIR}">${MERCHANT_REPO}/tree/${MERCHANT_PIN}/${CUSTOMER_EXAMPLE_DIR}</a>.
        Needs Node.js 22 and a Git checkout. The default commands show the price and terms first and sign nothing. Inspect and edit <code>fixtures/authorization-batch.json</code> yourself before any <code>--approve</code>
        purchase. If a payment's outcome is unknown, reconcile it rather than paying again.
      </p>
      <pre><code>${OBSERVE_QUICKSTART}</code></pre>
      <p>
        Backward-compatible single URL: <code>GET ${GATEWAY_ORIGIN}/extract</code>. The practical
        multi-URL job is <code>POST ${GATEWAY_ORIGIN}/extract/batch</code>.
      </p>
      <h2>Job 2. Compare explicit fields from two already-held observations</h2>
      <p>
        From the same <code>${CUSTOMER_EXAMPLE_DIR}</code> directory after <code>npm ci</code>. Free and local: name the fields you care about and see exactly what changed between two runs. Rows that only moved are reported as moved, not changed.
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
      <h2>Job 4. Save a result so the next agent can reuse it</h2>
      <p>
        From a SameDayDesk checkout, preview exactly which fields would be copied into a
        <code>neomorphic.task-memory.observation.v1</code> reference, then write only with
        <code>--opt-in</code>. It runs locally and copies only the fields you choose. Private source text, authorizations, receipt secrets and customer identifiers are left out. Failed and incomplete rows remain visible. The caller supplies
        stable task, subject, revision sequence, and current UTC clock values; the helper never invents them.
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
        <code>buyer-setup-trace</code> shows the AgentCash and x402 payment terms and stops before paying. Offline runs cost nothing; run them on your own schedule.
      </p>
      <pre><code>${RECURRING_QUICKSTART}</code></pre>
      <pre><code>${BUYER_SETUP_QUICKSTART}</code></pre>
      <h2>Live merchant inventory</h2>
      <ul>
        ${inventoryListHtml()}
        <li><a href="${X402_CANONICAL}">Human storefront for other machine services</a></li>
        <li><a href="${SITE_ORIGIN}/x402/seller-conformance">Seller audit</a></li>
        <li><a href="${SITE_ORIGIN}/x402/verified">Routes we checked</a></li>
      </ul>
    `;

export const X402_CRAWLER_HTML = `
      <h1>AI agents pay for what they use, in the same request</h1>
      <p>
        Paid tools your agent can call and pay for in the same request: exact USDC on Base through x402 or native MPP. No API key, subscription or account.
      </p>
      <p>
        Practical jobs live on
        <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>:
        web extraction at 0.01 USDC a batch with <code>POST /extract/batch</code>, free local comparison and record mapping, reuse of results you already have, and recurring page and issue checks. Every other paid tool is in the live inventory.
      </p>
      <ul>
        <li><a href="${FOR_AGENTS_CANONICAL}">Web data and free tools for agents</a></li>
        ${inventoryListHtml()}
        <li><a href="${SITE_ORIGIN}/x402/seller-conformance">Seller audit</a></li>
        <li><a href="${SITE_ORIGIN}/x402/verified">Routes we checked</a></li>
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

export const CONSUMER_REPEAT_PATH = "/for-agents/consumer-repeat";
export const CONSUMER_REPEAT_TITLE = "Run local consumer evidence jobs offline | SameDayDesk";
export const CONSUMER_REPEAT_DESCRIPTION =
  "Download one portable package for local evidence jobs: release brief, table reconcile, procurement brief, and related checks. Verify size and sha256 before extract. Supply your own files and an operator clock. Local provenance is integrity metadata, not an attestation.";
export const CONSUMER_REPEAT_CANONICAL = `${SITE_ORIGIN}${CONSUMER_REPEAT_PATH}`;
export const CONSUMER_REPEAT_ARCHIVE = CONSUMER_REPEAT_KIT.archive;
export const CONSUMER_REPEAT_ARCHIVE_SHA256 = CONSUMER_REPEAT_KIT.sha256;
export const CONSUMER_REPEAT_ARCHIVE_BYTES = CONSUMER_REPEAT_KIT.bytes;
export const CONSUMER_REPEAT_DISCOVERY = CONSUMER_REPEAT_KIT.discovery;
export const CONSUMER_REPEAT_SOURCE_REPO = CONSUMER_REPEAT_KIT.sourceRepo;
export const CONSUMER_REPEAT_SOURCE_COMMIT = CONSUMER_REPEAT_KIT.sourceCommit;
export const CONSUMER_REPEAT_REVIEWED_SOURCE = CONSUMER_REPEAT_KIT.reviewedSource;
export const CONSUMER_REPEAT_PACKAGE_ID = CONSUMER_REPEAT_KIT.packageId;

export function buildConsumerRepeatColdStart({
  siteOrigin = SITE_ORIGIN,
  archivePath = CONSUMER_REPEAT_ARCHIVE,
  bytes = CONSUMER_REPEAT_ARCHIVE_BYTES,
  sha256 = CONSUMER_REPEAT_ARCHIVE_SHA256,
} = {}) {
  const tgzName = "s178-consumer-repeat-kit.tgz";
  const rootName = "s178-consumer-repeat-kit";
  const cli = "bin/s178-cli.mjs";
  return [
    "s178_consumer_repeat_acquire() {",
    "  local origin=\"${S178_CONSUMER_REPEAT_ORIGIN:-${1:-" + siteOrigin + "}}\"",
    "  local bytes=" + String(bytes),
    "  local sha=" + sha256,
    "  local work tgz root",
    "  work=$(mktemp -d \"${TMPDIR:-/tmp}/s178-consumer-repeat.XXXXXX\") || return 1",
    "  tgz=\"\$work/" + tgzName + "\"",
    "  root=\"\$work/" + rootName + "\"",
    "  curl -fsSL --max-time 60 -o \"\$tgz\" \"\$origin" + archivePath + "\" || { rm -rf \"\$work\"; return 1; }",
    "  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write(\"size %s != %s\\n\" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write(\"sha256 %s != %s\\n\" % (h, sys.argv[3])) or 1))' \"\$tgz\" \"\$bytes\" \"\$sha\" || { rm -rf \"\$work\"; return 1; }",
    "  tar -xzf \"\$tgz\" -C \"\$work\" || { rm -rf \"\$work\"; return 1; }",
    "  [ -f \"\$root/" + cli + "\" ] || { rm -rf \"\$work\"; return 1; }",
    "  (cd \"\$root\" && node " + cli + " list >&2) || { rm -rf \"\$work\"; return 1; }",
    "  printf '%s\\n' \"\$root\"",
    "  return 0",
    "}",
    "kit=$(s178_consumer_repeat_acquire) || exit 1",
    "printf '%s\\n' \"\$kit\"",
  ].join("\n");
}

export const CONSUMER_REPEAT_COLD_START = buildConsumerRepeatColdStart();

export const CONSUMER_REPEAT_FIRST_USE = [
  "node \"$kit/bin/s178-cli.mjs\" list",
  "node \"$kit/bin/s178-cli.mjs\" example release-brief --kind conflict",
  "node \"$kit/bin/s178-cli.mjs\" run 07 --clock 2026-09-10T18:00:00.000Z",
  "node \"$kit/bin/s178-cli.mjs\" run release-brief --clock 2026-09-10T18:00:00.000Z",
].join("\n");

export const CONSUMER_REPEAT_CALLER_USE = [
  "node \"$kit/bin/s178-cli.mjs\" run 07 --in \"$PWD/caller-a.json\" --clock 2026-09-10T18:00:00.000Z",
  "node \"$kit/bin/s178-cli.mjs\" run release-brief --in \"$PWD/caller-b.json\" --clock 2026-09-10T18:00:00.000Z",
].join("\n");

export const CONSUMER_REPEAT_REPEAT_USE = [
  "node \"$kit/bin/s178-cli.mjs\" run release-brief --in \"$PWD/caller-partial.json\" --clock 2026-09-10T18:00:00.000Z > \"$PWD/repeat-note.json\"",
  "node \"$kit/bin/s178-cli.mjs\" run release-brief --in \"$PWD/caller-reconciled.json\" --clock 2026-09-10T18:00:00.000Z",
].join("\n");

export const CONSUMER_REPEAT_CRAWLER_HTML = `
      <h1>Run local evidence jobs from a portable package offline</h1>
      <p>
        SameDayDesk publishes one portable package for local consumer evidence jobs:
        documentation migration, release evidence brief, table reconcile, link index,
        replay pack, freshness receipt, procurement brief, customer result package,
        and acquisition status. Download the archive, verify size and sha256, then
        extract. Run labeled samples or your own files on a local Node 22 runtime.
        The CLI reads local files only. It does not fetch, charge, or overwrite caller files.
      </p>
      <p>
        Machine discovery:
        <a href="${SITE_ORIGIN}${CONSUMER_REPEAT_DISCOVERY}">${SITE_ORIGIN}${CONSUMER_REPEAT_DISCOVERY}</a>.
        Archive: <a href="${SITE_ORIGIN}${CONSUMER_REPEAT_ARCHIVE}">${SITE_ORIGIN}${CONSUMER_REPEAT_ARCHIVE}</a>
        (${CONSUMER_REPEAT_ARCHIVE_BYTES} bytes, sha256 <code>${CONSUMER_REPEAT_ARCHIVE_SHA256}</code>).
        Source <code>${CONSUMER_REPEAT_SOURCE_REPO}</code> at
        <code>${CONSUMER_REPEAT_SOURCE_COMMIT}</code>. Reviewed package source
        <code>${CONSUMER_REPEAT_REVIEWED_SOURCE}</code>.
        <a href="${SITE_ORIGIN}${CONSUMER_REPEAT_ARCHIVE}">Download archive</a>.
      </p>
      <h2>Cold start (verify before extract)</h2>
      <pre><code>${CONSUMER_REPEAT_COLD_START}</code></pre>
      <h2>Labeled samples (not caller files)</h2>
      <pre><code>${CONSUMER_REPEAT_FIRST_USE}</code></pre>
      <h2>Caller files</h2>
      <pre><code>${CONSUMER_REPEAT_CALLER_USE}</code></pre>
      <h2>Changed-input repeat</h2>
      <pre><code>${CONSUMER_REPEAT_REPEAT_USE}</code></pre>
      <p>
        Material limit: you must supply an operator clock. Local provenance files are
        integrity metadata, not an independent attestation, and <code>ok:true</code> is
        honest completion rather than a pass. Announced, shipped, and tested stay distinct.
        Paid observation jobs remain on
        <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>.
      </p>
    `;

export const CONSUMER_REPEAT_SHELL = Object.freeze({
  path: CONSUMER_REPEAT_PATH,
  title: CONSUMER_REPEAT_TITLE,
  description: CONSUMER_REPEAT_DESCRIPTION,
  canonical: CONSUMER_REPEAT_CANONICAL,
  crawlerHtml: CONSUMER_REPEAT_CRAWLER_HTML,
});

export const USEFUL_JOBS_PATH = "/for-agents/useful-jobs";
export const USEFUL_JOBS_TITLE = "Offline useful jobs for agent callers | SameDayDesk";
/** Customer-facing intro/SEO. Install tools and --example limits stay in detailed sections. */
export const USEFUL_JOBS_PUBLIC_SUMMARY =
  "Ten offline jobs for lockfile changes, JSON Schema drift, route changes, page changes, pricing snapshots, API upgrades, feed agendas, CI evidence, listing repairs, and repeat-job records. Download and verify the archive, then run on Node 22 with your own files. Free local package; not hosted execution.";
/** Precise release note for boundary/note surfaces only — not the headline. */
export const USEFUL_JOBS_RELEASE_NOTE =
  "Release 1.4.7 adds fresh verification for lockfile-pin-delta, json-schema-webhook-drift, route-table-diff, page-change-offline-job, and vendor-budget-impact. The other five jobs are carried forward without a new review.";
export const USEFUL_JOBS_DESCRIPTION = USEFUL_JOBS_PUBLIC_SUMMARY;
export const USEFUL_JOBS_CANONICAL = `${SITE_ORIGIN}${USEFUL_JOBS_PATH}`;
export const USEFUL_JOBS_ARCHIVE = USEFUL_JOBS_KIT.archive;
export const USEFUL_JOBS_ARCHIVE_SHA256 = USEFUL_JOBS_KIT.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = USEFUL_JOBS_KIT.bytes;
export const USEFUL_JOBS_DISCOVERY = USEFUL_JOBS_KIT.discovery;
export const USEFUL_JOBS_CATALOG = USEFUL_JOBS_KIT.catalog;
export const USEFUL_JOBS_OUTCOMES = USEFUL_JOBS_KIT.outcomes;
export const USEFUL_JOBS_SOURCE_REPO = USEFUL_JOBS_KIT.sourceRepo;
export const USEFUL_JOBS_SOURCE_COMMIT = USEFUL_JOBS_KIT.sourceCommit;
export const USEFUL_JOBS_ARCHIVE_FREEZE = USEFUL_JOBS_KIT.archiveFreeze;
export const USEFUL_JOBS_REVIEWED_SOURCE = USEFUL_JOBS_KIT.reviewedSource;
export const USEFUL_JOBS_ROOT = USEFUL_JOBS_KIT.rootName;
export const USEFUL_JOBS_CLI = USEFUL_JOBS_KIT.cli;
export const USEFUL_JOBS_JOB_IDS = Object.freeze([...USEFUL_JOBS_KIT.jobs]);
/** Host tools required only to download, verify, and extract the archive. */
export const USEFUL_JOBS_ACQUIRE_TOOLS = Object.freeze([
  "bash",
  "curl",
  "python3",
  "tar",
  "mktemp",
]);
/** Runtime after extract: offline Node 22 only. */
export const USEFUL_JOBS_RUNTIME = "Node >= 22 (offline after extract)";

export function buildUsefulJobsColdStart({
  siteOrigin = SITE_ORIGIN,
  archivePath = USEFUL_JOBS_ARCHIVE,
  bytes = USEFUL_JOBS_ARCHIVE_BYTES,
  sha256 = USEFUL_JOBS_ARCHIVE_SHA256,
  rootName = USEFUL_JOBS_ROOT,
  cli = USEFUL_JOBS_CLI,
} = {}) {
  const tgzName = String(archivePath).split("/").filter(Boolean).pop() || `${rootName}.tar.gz`;
  return [
    "useful_jobs_acquire() {",
    "  local origin=\"${USEFUL_JOBS_ORIGIN:-${1:-" + siteOrigin + "}}\"",
    "  local bytes=" + String(bytes),
    "  local sha=" + sha256,
    "  local work tgz root",
    "  work=$(mktemp -d \"${TMPDIR:-/tmp}/useful-jobs.XXXXXX\") || return 1",
    "  tgz=\"\$work/" + tgzName + "\"",
    "  root=\"\$work/" + rootName + "\"",
    "  curl -fsSL --max-time 60 -o \"\$tgz\" \"\$origin" + archivePath + "\" || { rm -rf \"\$work\"; return 1; }",
    "  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write(\"size %s != %s\\n\" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write(\"sha256 %s != %s\\n\" % (h, sys.argv[3])) or 1))' \"\$tgz\" \"\$bytes\" \"\$sha\" || { rm -rf \"\$work\"; return 1; }",
    "  tar -xzf \"\$tgz\" -C \"\$work\" || { rm -rf \"\$work\"; return 1; }",
    "  [ -f \"\$root/" + cli + "\" ] || { rm -rf \"\$work\"; return 1; }",
    "  (cd \"\$root\" && node " + cli + " list >&2) || { rm -rf \"\$work\"; return 1; }",
    "  printf '%s\\n' \"\$root\"",
    "  return 0",
    "}",
    "kit=$(useful_jobs_acquire) || exit 1",
    "printf '%s\\n' \"\$kit\"",
  ].join("\n");
}

export const USEFUL_JOBS_COLD_START = buildUsefulJobsColdStart();
/** Public install recipe: one self-contained cold-start invocation (single source of truth). */
export const USEFUL_JOBS_INSTALL = Object.freeze([USEFUL_JOBS_COLD_START]);

export const USEFUL_JOBS_LIST_HELP = [
  "node \"$kit/bin/useful-jobs.mjs\" list",
  "node \"$kit/bin/useful-jobs.mjs\" help",
  "node \"$kit/bin/useful-jobs.mjs\" help lockfile-pin-delta",
  "node \"$kit/bin/useful-jobs.mjs\" help api-upgrade-brief",
].join("\n");

export const USEFUL_JOBS_EXAMPLES = [
  "node \"$kit/bin/useful-jobs.mjs\" run lockfile-pin-delta --example",
  "node \"$kit/bin/useful-jobs.mjs\" run json-schema-webhook-drift --example",
  "node \"$kit/bin/useful-jobs.mjs\" run route-table-diff --example --out-dir \"$PWD/out/route-example\"",
  "node \"$kit/bin/useful-jobs.mjs\" run page-change-offline-job --job \"$kit/samples/page/h04-page-01/job.json\" --out-dir \"$PWD/out/page-h04\"",
  "node \"$kit/bin/useful-jobs.mjs\" run api-upgrade-brief --example",
  "node \"$kit/bin/useful-jobs.mjs\" run vendor-budget-impact --example",
  "node \"$kit/bin/useful-jobs.mjs\" run feed-agenda --example",
  "node \"$kit/bin/useful-jobs.mjs\" run evidence-ci-annotation --example",
  "node \"$kit/bin/useful-jobs.mjs\" run listing-repair-packet --example",
  "node \"$kit/bin/useful-jobs.mjs\" run repeat-job-record --example",
].join("\n");

export const USEFUL_JOBS_CALLER_USE = [
  "node \"$kit/bin/useful-jobs.mjs\" run lockfile-pin-delta \\",
  "  --before \"$kit/samples/lockfile/h04-pub-lock-01/before.json\" \\",
  "  --after \"$kit/samples/lockfile/h04-pub-lock-01/after.json\" \\",
  "  --out-dir \"$PWD/out/h04-lock\"",
  "node \"$kit/bin/useful-jobs.mjs\" run api-upgrade-brief \\",
  "  --before \"$kit/samples/openapi/caller-alpha/before.yaml\" \\",
  "  --after \"$kit/samples/openapi/caller-alpha/after.yaml\" \\",
  "  --used \"$kit/samples/openapi/caller-alpha/used.json\" \\",
  "  --out-dir \"$PWD/out/caller-alpha\"",
  "node \"$kit/bin/useful-jobs.mjs\" run api-upgrade-brief \\",
  "  --before \"$kit/samples/openapi/caller-beta/before.yaml\" \\",
  "  --after \"$kit/samples/openapi/caller-beta/after.yaml\" \\",
  "  --used \"$kit/samples/openapi/caller-beta/used.json\" \\",
  "  --out-dir \"$PWD/out/caller-beta\"",
].join("\n");

export const USEFUL_JOBS_REPEAT_USE = [
  "cp \"$kit/samples/openapi/caller-alpha/after.yaml\" \"$PWD/caller-alpha-after-edit.yaml\"",
  "printf '\\n# operator edit\\n' >> \"$PWD/caller-alpha-after-edit.yaml\"",
  "node \"$kit/bin/useful-jobs.mjs\" run api-upgrade-brief \\",
  "  --before \"$kit/samples/openapi/caller-alpha/before.yaml\" \\",
  "  --after \"$PWD/caller-alpha-after-edit.yaml\" \\",
  "  --used \"$kit/samples/openapi/caller-alpha/used.json\" \\",
  "  --out-dir \"$PWD/out/caller-alpha-repeat\"",
].join("\n");

export const USEFUL_JOBS_CRAWLER_HTML = `
      <h1>Offline useful jobs for agent callers</h1>
      <p>
        Turn changing files into useful next steps. ${USEFUL_JOBS_PUBLIC_SUMMARY}
      </p>
      <p>
        Machine discovery:
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_DISCOVERY}">${SITE_ORIGIN}${USEFUL_JOBS_DISCOVERY}</a>.
        Catalog:
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_CATALOG}">${SITE_ORIGIN}${USEFUL_JOBS_CATALOG}</a>.
        Outcomes:
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_OUTCOMES}">${SITE_ORIGIN}${USEFUL_JOBS_OUTCOMES}</a>.
        Archive: <a href="${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}">${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}</a>
        (${USEFUL_JOBS_ARCHIVE_BYTES} bytes, sha256 <code>${USEFUL_JOBS_ARCHIVE_SHA256}</code>).
        Source <code>${USEFUL_JOBS_SOURCE_REPO}</code> at
        <code>${USEFUL_JOBS_SOURCE_COMMIT}</code>. Archive freeze
        <code>${USEFUL_JOBS_ARCHIVE_FREEZE}</code>. Reviewed source
        <code>${USEFUL_JOBS_REVIEWED_SOURCE}</code>.
        Acquire tools: <code>${USEFUL_JOBS_ACQUIRE_TOOLS.join(", ")}</code>.
        Runtime after extract: <code>${USEFUL_JOBS_RUNTIME}</code>.
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}">Download archive</a>.
      </p>
      <h2>Install / cold start (verify before extract)</h2>
      <pre><code>${USEFUL_JOBS_COLD_START}</code></pre>
      <h2>List and help</h2>
      <pre><code>${USEFUL_JOBS_LIST_HELP}</code></pre>
      <h2>Labeled SAMPLE examples (not caller files)</h2>
      <pre><code>${USEFUL_JOBS_EXAMPLES}</code></pre>
      <h2>Two different callers</h2>
      <pre><code>${USEFUL_JOBS_CALLER_USE}</code></pre>
      <h2>Changed-file repeat</h2>
      <pre><code>${USEFUL_JOBS_REPEAT_USE}</code></pre>
      <p>
        Scope: free local package only. Missing inputs or digest mismatch stop the job.
        Partial vendor or listing evidence stays non-final. Evidence CI annotations from
        caller packets stay unattested. This package does not run hosted extract.
        ${USEFUL_JOBS_RELEASE_NOTE}
      </p>
    `;

export const USEFUL_JOBS_SHELL = Object.freeze({
  path: USEFUL_JOBS_PATH,
  title: USEFUL_JOBS_TITLE,
  description: USEFUL_JOBS_DESCRIPTION,
  canonical: USEFUL_JOBS_CANONICAL,
  crawlerHtml: USEFUL_JOBS_CRAWLER_HTML,
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
