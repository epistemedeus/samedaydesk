import { useEffect } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import styles from "./BuyerRuntime.module.css";

const PAGE_TITLE = "Buyer runtime integration (draft) | SameDayDesk";
const PAGE_DESCRIPTION =
  "Draft guide for wiring a buyer runtime to SameDayDesk paid routes: live discovery entry points, response-contract fields a runtime can verify, unpaid replay fixtures, and existing seams in Agent402, the Coinbase x402 client, and the x402 Bazaar row filter.";
const PAGE_URL = "https://samedaydesk.com/x402/buyer-runtime";
const GATEWAY = "https://agents.samedaydesk.com";
const MANIFEST_URL = `${GATEWAY}/.well-known/x402`;
const OPENAPI_URL = `${GATEWAY}/openapi.json`;
const EXTRACT_URL = `${GATEWAY}/extract?url=https://example.com`;
const AGENT402_INDEX_URL = "https://agent402.tools/api/index?seller=agents.samedaydesk.com";
const FIXTURE_PR_URL = "https://github.com/epistemedeus/samedaydesk/pull/23";
const AGENT402_REPO_URL = "https://github.com/MikeyPetrillo/Agent402";
const X402_REPO_URL = "https://github.com/x402-foundation/x402";
const X402_FILTER_PR_URL = "https://github.com/epistemedeus/x402/pull/1";
const AGENTKIT_REPO_URL = "https://github.com/coinbase/agentkit";

const CMD_MANIFEST = `curl -sS '${MANIFEST_URL}' \\
  | jq '{x402Version, lastUpdated, itemCount: (.items|length), routeTemplates: [.items[].resource.routeTemplate]}'`;

const CMD_OPENAPI = `curl -sS '${OPENAPI_URL}' \\
  | jq '{openapi, title: .info.title, version: .info.version, extractOperationId: .paths["/extract"].get.operationId, extractRequired: .paths["/extract"].get.responses["200"].content["application/json"].schema.required, extractProperties: (.paths["/extract"].get.responses["200"].content["application/json"].schema.properties | keys)}'`;

const CMD_AGENT402 = `curl -sS '${AGENT402_INDEX_URL}' \\
  | jq '{origin, health, routable, paidToolCount, discoveryPath, extractResponseContract: (.tools | map(select(.route=="/extract" and .method=="GET")) | .[0].responseContract)}'`;

const CMD_AGENTCASH = "npx -y @agentcash/discovery@1.7.5 discover https://agents.samedaydesk.com";

const CMD_EXTRACT_STATUS = `curl -sS -D - -o /tmp/samedaydesk-extract.402.json '${EXTRACT_URL}' \\
  | python3 -c 'import sys
for raw in sys.stdin:
    line = raw.split("\\r", 1)[0].rstrip("\\n")
    if not line:
        break
    key = line.split(":", 1)[0].lower()
    if line.upper().startswith("HTTP/"):
        print(line)
    elif key == "content-type":
        print(line)
    elif key in ("payment-required", "www-authenticate"):
        print(f"{key}: present")'`;

const CMD_EXTRACT_BODY = `curl -sS '${EXTRACT_URL}' \\
  | jq '{x402Version, error, resourceUrl: .resource.url, mimeType: .resource.mimeType, scheme: .accepts[0].scheme, extensionKeys: (.extensions|keys), bazaarExampleRequired: .extensions.bazaar.schema.properties.output.properties.example.required, bazaarExampleKeys: (.extensions.bazaar.info.output.example|keys)}'`;

const CMD_LOAD_FIXTURES = `node --input-type=module -e '
import { loadCatalog, loadRuntime } from "./tools/buyer-runtimes/lib.mjs";
const catalog = loadCatalog();
const agent402 = loadRuntime("agent402");
const coinbase = loadRuntime("coinbase-x402");
console.log(catalog.route.path, Object.keys(agent402.states), Object.keys(coinbase.states));
'`;

function restoreAttribute(el: Element | null, attribute: string, previous: string | null) {
  if (previous !== null) el?.setAttribute(attribute, previous);
}

export default function BuyerRuntime() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;

    const description = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');

    const previousDescription = description?.getAttribute("content") ?? null;
    const previousCanonical = canonical?.getAttribute("href") ?? null;
    const previousOgUrl = ogUrl?.getAttribute("content") ?? null;
    const previousOgTitle = ogTitle?.getAttribute("content") ?? null;
    const previousOgDescription = ogDescription?.getAttribute("content") ?? null;
    const previousTwitterTitle = twitterTitle?.getAttribute("content") ?? null;
    const previousTwitterDescription = twitterDescription?.getAttribute("content") ?? null;

    description?.setAttribute("content", PAGE_DESCRIPTION);
    canonical?.setAttribute("href", PAGE_URL);
    ogUrl?.setAttribute("content", PAGE_URL);
    ogTitle?.setAttribute("content", PAGE_TITLE);
    ogDescription?.setAttribute("content", PAGE_DESCRIPTION);
    twitterTitle?.setAttribute("content", PAGE_TITLE);
    twitterDescription?.setAttribute("content", PAGE_DESCRIPTION);

    track("x402_buyer_runtime_guide_viewed", { path: "/x402/buyer-runtime" });

    return () => {
      document.title = previousTitle;
      restoreAttribute(description, "content", previousDescription);
      restoreAttribute(canonical, "href", previousCanonical);
      restoreAttribute(ogUrl, "content", previousOgUrl);
      restoreAttribute(ogTitle, "content", previousOgTitle);
      restoreAttribute(ogDescription, "content", previousOgDescription);
      restoreAttribute(twitterTitle, "content", previousTwitterTitle);
      restoreAttribute(twitterDescription, "content", previousTwitterDescription);
    };
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Draft · unpaid discovery · response contract</p>
          <h1 className={styles.h1}>
            Wire a buyer runtime to <span className="lime">SameDayDesk</span> paid routes
          </h1>
          <p className={styles.lead}>
            This page is draft copy. It tells a runtime author which live discovery entry points
            exist today, which JSON fields a runtime can verify on a successful <code>/extract</code>{" "}
            body, how to load the unpaid replay fixtures, and where three existing runtimes already
            attach. It does not authorize payment and does not copy payment terms.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primary}
              href={MANIFEST_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Live x402 manifest
            </a>
            <a className={styles.secondary} href="/x402">
              Agent payment infrastructure
            </a>
            <a className={styles.secondary} href="/docs/x402-sdk/">
              SDK integration reference
            </a>
          </div>
        </header>

        <section className={styles.section} aria-labelledby="draft-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Status</p>
            <h2 id="draft-title">Draft only</h2>
          </div>
          <p className={styles.prose}>
            Publication is not implied by this route existing in the repository. Payment terms
            (scheme extras, asset, amount, recipient, network, facilitator) are published by the
            live manifest. Read them there; do not hard-code them from this page.
          </p>
          <p className={styles.prose}>
            Covered runtimes: Agent402, the Coinbase x402 client (<code>@x402/fetch</code> and{" "}
            <code>@x402/core</code>), and the x402 Bazaar inspected-route filter in{" "}
            <code>@x402/extensions</code>.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="discover-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Discovery</p>
            <h2 id="discover-title">Entry points that exist today</h2>
          </div>
          <p className={styles.prose}>
            Origin machine contracts live on <code>{GATEWAY}</code>. Catalog indexes that currently
            return an owned, current SameDayDesk record are listed with the command used to confirm
            them. Indexes that are missing or stale are omitted.
          </p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Surface</th>
                  <th>What it is</th>
                  <th>Confirm</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <a href={MANIFEST_URL} target="_blank" rel="noopener noreferrer">
                      /.well-known/x402
                    </a>
                  </td>
                  <td>Origin x402 resource manifest. Source of payment terms.</td>
                  <td>Command 1</td>
                </tr>
                <tr>
                  <td>
                    <a href={OPENAPI_URL} target="_blank" rel="noopener noreferrer">
                      /openapi.json
                    </a>
                  </td>
                  <td>Origin OpenAPI 3.1 document, including per-operation response schemas.</td>
                  <td>Command 2</td>
                </tr>
                <tr>
                  <td>
                    <a href={AGENT402_INDEX_URL} target="_blank" rel="noopener noreferrer">
                      Agent402 seller index
                    </a>
                  </td>
                  <td>
                    Public <code>?seller=agents.samedaydesk.com</code> index. Reads the origin
                    manifest path.
                  </td>
                  <td>Command 3</td>
                </tr>
                <tr>
                  <td>AgentCash discovery CLI</td>
                  <td>
                    <code>@agentcash/discovery</code> reads the origin OpenAPI document.
                  </td>
                  <td>Command 4</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.commands}>
            <div>
              <span>Command 1 · origin manifest</span>
              <pre><code>{CMD_MANIFEST}</code></pre>
            </div>
            <div>
              <span>Command 2 · origin OpenAPI</span>
              <pre><code>{CMD_OPENAPI}</code></pre>
            </div>
            <div>
              <span>Command 3 · Agent402 seller index</span>
              <pre><code>{CMD_AGENT402}</code></pre>
            </div>
            <div>
              <span>Command 4 · AgentCash OpenAPI discovery</span>
              <pre><code>{CMD_AGENTCASH}</code></pre>
              <p>
                The CLI prints per-route prices. Use{" "}
                <a href={MANIFEST_URL} target="_blank" rel="noopener noreferrer">
                  the live manifest
                </a>{" "}
                for those values. The fields to keep from this command are <code>Source</code>,{" "}
                <code>Spec</code>, <code>API</code>, and <code>Routes</code>.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="contract-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Verify</p>
            <h2 id="contract-title">Response contract fields</h2>
          </div>
          <p className={styles.prose}>
            Pin one unpaid probe: <code>GET {EXTRACT_URL}</code>. Do not send{" "}
            <code>PAYMENT-SIGNATURE</code> or <code>X-PAYMENT</code>. A runtime can verify the
            following without copying payment terms from the 402:
          </p>
          <ul className={styles.list}>
            <li>
              HTTP status <code>402</code>, a <code>PAYMENT-REQUIRED</code> header, and a JSON body
              with <code>x402Version</code>, <code>resource.url</code>, <code>resource.mimeType</code>,
              and <code>accepts[].scheme</code>.
            </li>
            <li>
              OpenAPI <code>GET /extract</code> operation <code>extractUrl</code>: successful JSON
              requires <code>ok</code>, <code>url</code>, and <code>title</code>. Additional
              documented properties: <code>description</code>, <code>jsonLd</code>,{" "}
              <code>openGraph</code>, <code>headings</code>, <code>links</code>, <code>text</code>,{" "}
              <code>aiReadiness</code>.
            </li>
            <li>
              Agent402 <code>responseContract.guaranteedPaths</code> for <code>GET /extract</code>:{" "}
              <code>ok</code>, <code>title</code>, <code>url</code>. Source:{" "}
              <code>seller_openapi</code>.
            </li>
            <li>
              Unpaid 402 <code>extensions.bazaar</code> example required keys: <code>ok</code>,{" "}
              <code>url</code>, <code>title</code>.
            </li>
          </ul>
          <div className={styles.commands}>
            <div>
              <span>Command 5 · unpaid 402 headers, no payment-term copy</span>
              <pre><code>{CMD_EXTRACT_STATUS}</code></pre>
            </div>
            <div>
              <span>Command 6 · unpaid 402 body contract fields</span>
              <pre><code>{CMD_EXTRACT_BODY}</code></pre>
            </div>
          </div>
          <p className={styles.prose}>
            Decode <code>PAYMENT-REQUIRED</code> locally if the client needs accept terms. Compare
            those terms to{" "}
            <a href={MANIFEST_URL} target="_blank" rel="noopener noreferrer">
              {MANIFEST_URL}
            </a>
            . Do not copy recipient, network, asset, amount, or facilitator values into runtime
            source from this page.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="fixtures-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Fixtures</p>
            <h2 id="fixtures-title">Unpaid replay fixture set</h2>
          </div>
          <p className={styles.prose}>
            Pull request{" "}
            <a href={FIXTURE_PR_URL} target="_blank" rel="noopener noreferrer">
              epistemedeus/samedaydesk#23
            </a>{" "}
            adds an unpaid five-state replay for two runtimes against <code>GET /extract</code>. The
            files are not payment credentials. Construct states omit <code>PAYMENT-SIGNATURE</code>{" "}
            and <code>X-PAYMENT</code>. Stop states record that no wallet is present.
          </p>
          <ul className={styles.list}>
            <li>
              Shared pin: <code>fixtures/buyer-runtimes/catalog.json</code>
            </li>
            <li>
              Agent402: <code>fixtures/buyer-runtimes/agent402/sources.json</code> and{" "}
              <code>fixtures/buyer-runtimes/agent402/states/{"{discover,construct,contract,authorize-ready,stop}"}.json</code>
            </li>
            <li>
              Coinbase x402 client: <code>fixtures/buyer-runtimes/coinbase-x402/sources.json</code>{" "}
              and the same five state files under <code>fixtures/buyer-runtimes/coinbase-x402/states/</code>
            </li>
            <li>
              Loader and checks: <code>tools/buyer-runtimes/lib.mjs</code>,{" "}
              <code>tools/buyer-runtimes/test.mjs</code>, <code>npm run test:buyer-runtimes</code>
            </li>
          </ul>
          <p className={styles.prose}>
            From the repository root, after those files are present:
          </p>
          <div className={styles.commands}>
            <div>
              <span>Load catalog and both runtimes</span>
              <pre><code>{CMD_LOAD_FIXTURES}</code></pre>
            </div>
            <div>
              <span>Run the unpaid replay checks</span>
              <pre><code>npm run test:buyer-runtimes</code></pre>
            </div>
          </div>
          <p className={styles.prose}>
            <code>loadCatalog()</code> reads <code>fixtures/buyer-runtimes/catalog.json</code>.{" "}
            <code>loadRuntime(&quot;agent402&quot;)</code> and{" "}
            <code>loadRuntime(&quot;coinbase-x402&quot;)</code> each return <code>sources</code> plus
            the five state objects. Set <code>SKIP_LIVE_BUYER_REPLAY=1</code> to skip live unpaid
            probes and keep only the committed pins.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="seams-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Existing seams</p>
            <h2 id="seams-title">One worked example per runtime</h2>
          </div>
          <p className={styles.prose}>
            These are file paths and functions that already exist. They are not new APIs.
          </p>

          <article className={styles.runtime}>
            <h3>Agent402</h3>
            <p>
              Repository:{" "}
              <a href={AGENT402_REPO_URL} target="_blank" rel="noopener noreferrer">
                MikeyPetrillo/Agent402
              </a>
              . Package: <code>agent402-client</code>. SameDayDesk discovery uses the verified
              seller index, not a generic router query.
            </p>
            <ul className={styles.list}>
              <li>
                Discover: <code>src/x402-index.js</code> <code>sellerDetail</code> (lines 3600–3651)
                served at <code>GET /api/index?seller=agents.samedaydesk.com</code>. Client wrapper:{" "}
                <code>client/index.js</code> <code>route()</code> (lines 168–196).
              </li>
              <li>
                Construct: <code>src/x402-buyer.js</code> unpaid <code>fetch</code> (lines 408–428)
                in <code>payX402</code>. A 200 is treated as free; only a 402 starts payment.
              </li>
              <li>
                Contract: <code>src/x402-buyer.js</code> lines 430–444 call{" "}
                <code>getPaymentRequiredResponse</code> then <code>pickPayableAccept</code>.
              </li>
              <li>
                Authorize-ready: <code>pickPayableAccept</code> at{" "}
                <code>src/x402-buyer.js</code> lines 54–65; <code>parse402Usd</code> at{" "}
                <code>client/index.js</code> lines 553–570.{" "}
                <code>withPayeeAllowlist</code> / <code>withNetworkPreference</code> wrap{" "}
                <code>createPaymentPayload</code> (lines 655–697) and throw before a signature
                exists.
              </li>
              <li>
                Stop: <code>getUpstreamBuyer</code> at <code>src/x402-buyer.js</code> lines 76–81
                throws when <code>X402_UPSTREAM_BUYER_KEY</code> is unset.
              </li>
            </ul>
            <p>
              Fixture citations: <code>fixtures/buyer-runtimes/agent402/sources.json</code>.
            </p>
          </article>

          <article className={styles.runtime}>
            <h3>Coinbase x402 client</h3>
            <p>
              Repository:{" "}
              <a href={X402_REPO_URL} target="_blank" rel="noopener noreferrer">
                x402-foundation/x402
              </a>
              . Packages: <code>@x402/fetch</code>, <code>@x402/core</code> (<code>x402Client</code>
              ). AgentKit wraps the same parse path; it is not a separate protocol.
            </p>
            <ul className={styles.list}>
              <li>
                Construct: <code>typescript/packages/http/fetch/src/index.ts</code>{" "}
                <code>wrapFetchWithPayment</code> (lines 40–54) clones the caller request and{" "}
                <code>fetch</code>es first with no payment header.
              </li>
              <li>
                Contract: same file, lines 52–78, returns unless status is 402, then{" "}
                <code>httpClient.getPaymentRequiredResponse</code>. Header parse lives in{" "}
                <code>typescript/packages/core/src/http/x402HTTPClient.ts</code> lines 117–138 (v2{" "}
                <code>PAYMENT-REQUIRED</code>, v1 body fallback).
              </li>
              <li>
                Authorize-ready: <code>typescript/packages/core/src/client/x402Client.ts</code>{" "}
                <code>createPaymentPayload</code> (lines 463–519) and{" "}
                <code>selectPaymentRequirements</code> (lines 696–766). v2 amount field is{" "}
                <code>requirement.amount</code>; v1 is <code>maxAmountRequired</code> (lines
                787–790).
              </li>
              <li>
                Discover (AgentKit wrapper):{" "}
                <code>typescript/agentkit/src/action-providers/x402/x402ActionProvider.ts</code>{" "}
                <code>discoverX402Services</code> (lines 80–114) pages{" "}
                <code>/discovery/resources</code>. Helpers:{" "}
                <code>typescript/agentkit/src/action-providers/x402/utils.ts</code>{" "}
                <code>fetchAllDiscoveryResources</code> (lines 97–137) in{" "}
                <a href={AGENTKIT_REPO_URL} target="_blank" rel="noopener noreferrer">
                  coinbase/agentkit
                </a>
                .
              </li>
            </ul>
            <p>
              Fixture citations: <code>fixtures/buyer-runtimes/coinbase-x402/sources.json</code>.
            </p>
          </article>

          <article className={styles.runtime}>
            <h3>x402 Bazaar inspected-route filter</h3>
            <p>
              Same <code>x402-foundation/x402</code> tree. The attach point is an opt-in helper on
              the existing Bazaar client, not a new ranking authority. Draft patch:{" "}
              <a href={X402_FILTER_PR_URL} target="_blank" rel="noopener noreferrer">
                epistemedeus/x402#1
              </a>
              .
            </p>
            <ul className={styles.list}>
              <li>
                File: <code>typescript/packages/extensions/src/bazaar/facilitatorClient.ts</code>
              </li>
              <li>
                Helper: <code>filterDiscoveryResources</code> at line 233. It takes{" "}
                <code>listResources</code> / <code>search</code> rows plus an already-parsed
                inspected-route document (<code>origin</code>, <code>route</code>,{" "}
                <code>badge</code>) and keeps rows whose resource URL matches a{" "}
                <code>badge === &quot;verified&quot;</code> feed row. Original order is preserved.
                <code>drift</code> and <code>unverified</code> never keep a row. No fetch, no rank,
                no payment.
              </li>
              <li>
                Producer: <code>withBazaar</code> → <code>client.extensions.bazaar.listResources</code>{" "}
                at line 317 of the same file.
              </li>
              <li>
                Export: <code>typescript/packages/extensions/src/bazaar/index.ts</code> re-exports{" "}
                <code>filterDiscoveryResources</code>, <code>withBazaar</code>, and the feed types.
              </li>
            </ul>
            <p>
              Callers already <code>.filter</code> Bazaar arrays. This helper is that existing
              concept. The feed document is passed in; the helper does not fetch a URL.
            </p>
          </article>
        </section>

        <section className={styles.note} aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Boundary</p>
            <h2 id="boundary-title">What this page does not do</h2>
          </div>
          <p>
            It does not send a payment header, create a wallet, or treat an unpaid 402 as
            settlement. It does not claim demand or revenue. Catalog indexes that are missing or
            stale are not listed as entry points. For current accept terms, use{" "}
            <a
              className={styles.inlineLink}
              href={MANIFEST_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {MANIFEST_URL}
            </a>
            .
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
