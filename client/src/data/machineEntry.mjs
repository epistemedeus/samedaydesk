// Single authority for /for-agents and /x402 machine-entry copy.
// Route shells, the React pages, llms tests, and crawler HTML all read this file.
// Live paid HTTP/MCP counts are not literals here. Link the merchant inventories.

export const SITE_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const MERCHANT_REPO = "https://github.com/epistemedeus/x402-url-extractor";
export const MERCHANT_PIN = "ef46e2b5213b9436e5cc4339a159c8ae837db880";
export const CUSTOMER_EXAMPLE_VERSION = "0.2.3";
export const CUSTOMER_EXAMPLE_DIR = "examples/customer-x402";
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

export const FOR_AGENTS_PATH = "/for-agents";
export const FOR_AGENTS_TITLE = "Practical agent jobs | SameDayDesk";
export const FOR_AGENTS_DESCRIPTION =
  "Obtain bounded observations, compare selected fields, or map held JSON into buyer records. Paid acquisition and two offline jobs stay distinct.";
export const FOR_AGENTS_CANONICAL = `${SITE_ORIGIN}${FOR_AGENTS_PATH}`;

export const X402_PATH = "/x402";
export const X402_TITLE = "Agent Payment Infrastructure: x402 and MPP | SameDayDesk";
export const X402_DESCRIPTION =
  "Call SameDayDesk machine services with x402 or native MPP on Base. Live HTTP, MCP, and x402 inventories are authoritative. Two practical jobs start at /for-agents.";
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
      <h1>Obtain observations or use either offline job</h1>
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
        Current source labels are untrusted, not buyer proof.
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
        Three complete jobs live on
        <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>:
        paid bounded <code>POST /extract/batch</code> observations, plus free offline comparison and
        explicit buyer-record mapping for already-held observations. Other named calls remain on
        the live inventory.
      </p>
      <ul>
        <li><a href="${FOR_AGENTS_CANONICAL}">Practical agent jobs</a></li>
        ${inventoryListHtml()}
        <li><a href="${SITE_ORIGIN}/x402/seller-conformance">Seller conformance proof</a></li>
        <li><a href="${SITE_ORIGIN}/x402/verified">Inspected x402 route list</a></li>
        <li><a href="${SITE_ORIGIN}/docs/x402-sdk/">x402 SDK integration reference</a></li>
      </ul>
    `;

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
