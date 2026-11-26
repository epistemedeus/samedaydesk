var e={archive:`/kit/distribution-repair-ab84d79b0272.tar.gz`,sha256:`64a97dab335aa82d80d9e4384ef8ec89d0bc0920aa844a19b4c2534ad5be5c13`,bytes:76599,discovery:`/discovery/distribution-repair.json`,record04:`0e703bd4682894df4e1d25c61b594cac49f2463c`,record05:`a7e2cd7a2223e2aa7e7e09eebf3695aba4731205`,dist08:`ea000772cdbd6d5df7174369dcef9aa2270e5723`,nl06:`76c0732b241beaa569f05a7394fdbf49604ffb66`},t={archive:`/kit/s178-consumer-repeat-kit.tgz`,sha256:`04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`,bytes:718948,discovery:`/discovery/consumer-repeat.json`,sourceRepo:`epistemedeus/x402-url-extractor`,sourceCommit:`e7a53c48a2db5393e1e340e5d43143547f79dbd7`,reviewedSource:`361460288e96d43da2f215e158fad96745507fde`,packageId:`s178-consumer-repeat-kit`,invokesPricedExecution:!1},n={packageId:`useful-jobs`,version:`1.4.7`,archive:`/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`,kitArchive:`/kit/useful-jobs-1.4.7.tar.gz`,sha256:`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`,bytes:5255824,discovery:`/discovery/useful-jobs.json`,catalog:`/for-agents/useful-jobs/catalog.json`,outcomes:`/for-agents/useful-jobs/jobs-outcomes.json`,sourceRepo:`epistemedeus/samedaydesk`,sourceCommit:`27f0730604adf236e0f3ad818a30b5f43be6e656`,archiveFreeze:`27f0730604adf236e0f3ad818a30b5f43be6e656`,reviewedSource:`27f0730604adf236e0f3ad818a30b5f43be6e656`,node:`>=22`,offline:!0,purchaseAuthority:!1,paidHostedClaim:!1,schedulerDaemon:!1,rootName:`useful-jobs-1.4.7`,cli:`bin/useful-jobs.mjs`,jobs:[`lockfile-pin-delta`,`json-schema-webhook-drift`,`route-table-diff`,`page-change-offline-job`,`api-upgrade-brief`,`vendor-budget-impact`,`feed-agenda`,`evidence-ci-annotation`,`listing-repair-packet`,`repeat-job-record`],newlyReviewedJobIds:[`lockfile-pin-delta`,`json-schema-webhook-drift`,`route-table-diff`,`page-change-offline-job`,`vendor-budget-impact`],inheritedJobIds:[`api-upgrade-brief`,`feed-agenda`,`evidence-ci-annotation`,`listing-repair-packet`,`repeat-job-record`],previous:{version:`1.4.0`,archive:`/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`,kitArchive:`/kit/useful-jobs-1.4.0.tar.gz`,sha256:`2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`,bytes:2575215,rootName:`useful-jobs-1.4.0`},immutableArchives:[{version:`1.0.0`,archive:`/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`,kitArchive:`/kit/useful-jobs-1.0.0.tar.gz`,sha256:`6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`,bytes:2522418,rootName:`useful-jobs-1.0.0`},{version:`1.1.0`,archive:`/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz`,kitArchive:`/kit/useful-jobs-1.1.0.tar.gz`,sha256:`de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534`,bytes:2577606,rootName:`useful-jobs-1.1.0`},{version:`1.2.0`,archive:`/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz`,kitArchive:`/kit/useful-jobs-1.2.0.tar.gz`,sha256:`dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb`,bytes:2579117,rootName:`useful-jobs-1.2.0`},{version:`1.3.0`,archive:`/for-agents/useful-jobs/useful-jobs-1.3.0.tar.gz`,kitArchive:`/kit/useful-jobs-1.3.0.tar.gz`,sha256:`bc4db0ec83109852b8fdbd542d10d515c0053a30dd9b93836c9ad7c738510b6c`,bytes:2574904,rootName:`useful-jobs-1.3.0`},{version:`1.4.0`,archive:`/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`,kitArchive:`/kit/useful-jobs-1.4.0.tar.gz`,sha256:`2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`,bytes:2575215,rootName:`useful-jobs-1.4.0`}]},r=`https://samedaydesk.com`,i=`https://agents.samedaydesk.com`,a=`https://github.com/epistemedeus/x402-url-extractor`,o=`ef46e2b5213b9436e5cc4339a159c8ae837db880`,ee=`f9dd59ae`,te=`0.2.3`,s=`examples/customer-x402`,c=Object.freeze({C31:Object.freeze({label:`page-change compare`,reportSchema:`pilot/page-change-brief/v1`,httpProduct:`samedaydesk-page-change-http`,httpSchema:`samedaydesk.page-change-http.v0`,route:`${i}/recipes/page-change`,health:`${i}/recipes/page-change/health`,openapi:`${i}/recipes/page-change/openapi.json`,requiredFields:Object.freeze([`before`,`after`,`fields`])}),C34:Object.freeze({label:`extract-batch record + skills discovery`,product:`samedaydesk-extract-batch`,schemaVersion:`samedaydesk.extract-batch.v0`,skillsIndex:`${i}/.well-known/skills/index.json`,requiredTopFields:Object.freeze([`ok`,`product`,`schemaVersion`,`quote`,`jobId`,`jobStatus`,`stopReason`,`partial`,`sources`,`accounting`,`costInputs`,`charged`,`boundary`])})}),l=`${a}/blob/${o}/plugins/samedaydesk-extract/skills/explicit-record/SKILL.md`,u=Object.freeze([Object.freeze({label:`HTTP action catalog`,href:`${i}/api/actions`}),Object.freeze({label:`x402 resource manifest`,href:`${i}/.well-known/x402`}),Object.freeze({label:`Health, prices, and protocol route counts`,href:`${i}/healthz`}),Object.freeze({label:`Paid MCP`,href:`${i}/mcp`}),Object.freeze({label:`Gateway llms.txt`,href:`${i}/llms.txt`}),Object.freeze({label:`OpenAPI`,href:`${i}/openapi.json`})]),d=[`git clone ${a}.git`,`cd x402-url-extractor`,`git checkout ${o}`,`cd ${s}`,`node --version # must report v22.x`,`npm ci`,`npm start`].join(`
`),f=[`npm run page-change -- job --job ./fixtures/page-change/customer-job/job.json`,`npm run page-change -- compare \\`,`  --before ./fixtures/page-change/customer-job/before.json \\`,`  --after ./fixtures/page-change/customer-job/after.json \\`,`  --fields title,description,headings \\`,`  --format text`].join(`
`),p=[`npm run record -- \\`,`  --input ./fixtures/record/product-jsonld/delivery/extract-batch.json \\`,`  --mapping ./fixtures/record/required-sku/mapping.json \\`,`  --schema ./fixtures/record/required-sku/schema.json \\`,`  --out /tmp/samedaydesk-record-required-sku`].join(`
`),m=[`NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"`,`node tools/result-reuse/cli.mjs preview \\`,`  --input tools/result-reuse/fixtures/accepted-page-change.json \\`,`  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"`,`node tools/result-reuse/cli.mjs export \\`,`  --input tools/result-reuse/fixtures/accepted-page-change.json \\`,`  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW" \\`,`  --opt-in --out /tmp/samedaydesk-reuse-observation.json`].join(`
`),h=[`# Required: --prior, --schedule, --clock, --fields; plus one of --current-fixture | --live-safe | --sources | --candidate | --issue-url | --issue-fixture`,`node tools/recurring-job-recipes/cli.mjs --list`,`node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \\`,`  --prior tools/recurring-job-recipes/fixtures/priors/source-change.prior.json \\`,`  --current-fixture tools/recurring-job-recipes/fixtures/current/example-unchanged.json \\`,`  --fields title --schedule daily --clock 2026-09-09T16:00:00.000Z --horizon 168`,`node tools/recurring-job-recipes/cli.mjs --recipe issue-to-work-brief \\`,`  --prior tools/recurring-job-recipes/fixtures/priors/issue-brief.prior.json \\`,`  --issue-url https://github.com/epistemedeus/samedaydesk/issues/1 \\`,`  --schedule weekly --clock 2026-09-09T16:00:00.000Z`,`node tools/recurring-job-recipes/cli.mjs --recipe buyer-setup-trace \\`,`  --schedule once --clock 2026-09-09T16:00:00.000Z`].join(`
`),g=[`# Live free inspection only. Stops at unpaid 402. Never signs. Never infers wallet ownership from payTo.`,`# Local merchant: sibling x402-url-extractor (name x402-merchant) or MERCHANT_INPUT_ROOT. Pin ${ee}. No network clone.`,`node tools/recurring-job-recipes/cli.mjs --recipe buyer-setup-trace \\`,`  --schedule once --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \\`,`  --gateway-origin https://agents.samedaydesk.com`].join(`
`),_=`/for-agents`,ne=`Practical agent jobs | SameDayDesk`,re=`Obtain bounded observations, compare or record already-held JSON, then optionally export a reuse reference. Schema-valid export is user-selected unverified evidence. Purchasing never requires publishing.`,v=`${r}${_}`,ie=`/x402`,ae=`Agent Payment Infrastructure: x402 and MPP | SameDayDesk`,oe=`Call SameDayDesk machine services with x402 or native MPP on Base. Live HTTP, MCP, and x402 inventories are authoritative. Practical jobs start at /for-agents.`,se=`${r}${ie}`;function ce(e,t){let n=e.title;e.title=t.title;let r=[[`meta[name="description"]`,`content`,t.description],[`link[rel="canonical"]`,`href`,t.canonical],[`meta[property="og:url"]`,`content`,t.canonical],[`meta[property="og:title"]`,`content`,t.title],[`meta[property="og:description"]`,`content`,t.description],[`meta[name="twitter:title"]`,`content`,t.title],[`meta[name="twitter:description"]`,`content`,t.description]].map(([t,n,r])=>{let i=e.querySelector(t),a=i?.getAttribute(n)??null;return i?.setAttribute(n,r),{element:i,attribute:n,previous:a}});return()=>{e.title=n;for(let{element:e,attribute:t,previous:n}of r)n===null?e?.removeAttribute(t):e?.setAttribute(t,n)}}function y(){return u.map(e=>`<li><a href="${e.href}">${e.label}</a></li>`).join(``)}var le=`
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
        Public customer example ${te} at
        <a href="${a}/tree/${o}/${s}">${a}/tree/${o}/${s}</a>.
        Requires Node.js 22.x and a full Git checkout, not a packed tarball.
        Default commands are unpaid preflight against the live merchant, not an offline fixture. They
        sign nothing. Inspect and edit <code>fixtures/authorization-batch.json</code> yourself before any <code>--approve</code>
        purchase. Optional attempt receipt and read-only reconcile are separate.
        Reconcile an unknown payment outcome instead of automatically retrying. This page includes
        no keys, secret URLs, or purchase.
      </p>
      <pre><code>${d}</code></pre>
      <p>
        Backward-compatible single URL: <code>GET ${i}/extract</code>. The practical
        multi-URL job is <code>POST ${i}/extract/batch</code>.
      </p>
      <h2>Job 2. Compare explicit fields from two already-held observations</h2>
      <p>
        From the same <code>${s}</code> directory after <code>npm ci</code>. The
        recipe does not fetch, pay, retry, or contact the merchant. Selected fields are required. An
        absent selected field is coverage unknown, not deletion. Reordered rows with the same
        source URL are order, not content change. Fixture output is owner proof, not buyer demand.
      </p>
      <pre><code>${f}</code></pre>
      <h2>Job 3. Map already-held JSON into buyer records</h2>
      <p>
        From the same pinned checkout and directory, the explicit-record CLI maps only buyer-named
        JSON Pointers and validates the result against the buyer's local JSON Schema. It does not
        fetch or infer. In the product and organization/contact examples, missing <code>sku</code>
        and <code>email</code> are optional. The command below is a separate truthful required-field
        example: it keeps one usable product record, labels the row missing required <code>sku</code>
        invalid, accounts for the failed source row, writes all three artifacts, and exits 1.
        <a href="${l}">Read the pinned explicit-record workflow</a>.
      </p>
      <pre><code>${p}</code></pre>
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
      <pre><code>${m}</code></pre>
      <h2>Job 5. Recurring page, issue, and buyer-setup recipes</h2>
      <p>
        From a SameDayDesk checkout, run one-shot recurring recipes against an immutable prior.
        Operator supplies <code>--prior</code> (where required), <code>--schedule</code>,
        <code>--clock</code>, and an observation source. Primary developer-agent workflows are
        <code>source-change-alert</code> and <code>issue-to-work-brief</code>. Outcomes are
        unchanged, changed, partial, stale baseline, timed out, or error. Priors are never
        overwritten; write a new sequenced artifact after review. C31 page-change reports use
        <code>pilot/page-change-brief/v1</code> at
        <a href="${c.C31.route}">${c.C31.route}</a>.
        C34 extract-batch records use <code>${c.C34.schemaVersion}</code>
        with skills at
        <a href="${c.C34.skillsIndex}">${c.C34.skillsIndex}</a>.
        <code>buyer-setup-trace</code> is live free inspection of the AgentCash/x402 runtime and
        stops at unpaid 402 without signing or inferring wallet ownership from addresses.
        Payment receipts are never automatically replayed.
        Optional local observation export stays filesystem-local when shared mode is
        undeployed. Offline runs avoid merchant charges; operator CPU and network remain
        costs_unknown. Listed batch price 0.01 USDC is not invoked here. No cron is installed.
        Owner QA issues are not demand.
      </p>
      <pre><code>${h}</code></pre>
      <pre><code>${g}</code></pre>
      <h2>Live merchant inventory</h2>
      <ul>
        ${y()}
        <li><a href="${se}">Human storefront for other machine services</a></li>
        <li><a href="${r}/x402/seller-conformance">Seller conformance proof</a></li>
        <li><a href="${r}/x402/verified">Inspected x402 route list</a></li>
      </ul>
    `,ue=`
      <h1>Agents discover a service, call it, pay, and continue</h1>
      <p>
        SameDayDesk machine services settle exact Base USDC through x402 or native MPP. No API
        key, subscription, or account is required. Discovery is not authorization, settlement,
        demand, or revenue. Live catalogs are authoritative; this page does not freeze a tool count.
      </p>
      <p>
        Practical jobs live on
        <a href="${v}">/for-agents</a>:
        paid bounded <code>POST /extract/batch</code> observations, free offline comparison and
        explicit buyer-record mapping, opt-in reuse of an already produced result, and one-shot
        recurring page or record recipes with immutable priors.
        Purchasing never requires publishing. Other named calls remain on the live inventory.
      </p>
      <ul>
        <li><a href="${v}">Practical agent jobs</a></li>
        ${y()}
        <li><a href="${r}/x402/seller-conformance">Seller conformance proof</a></li>
        <li><a href="${r}/x402/verified">Inspected x402 route list</a></li>
        <li><a href="${r}/docs/x402-sdk/">x402 SDK integration reference</a></li>
      </ul>
    `,b=`/for-agents/record-repeat`,de=`Compare OpenAPI, prices, keyed CSV, and feeds offline | SameDayDesk`,fe=`Download one portable package to compare OpenAPI used operations, price/unit rows, keyed CSV, and RSS/Atom feeds on local files. Labeled samples and next-run manifests included. The CLI does not fetch, charge, or schedule. Unsupported HTML and missing identity or units are refused.`,pe=`${r}${b}`,x=`/kit/record-repeat-job-ab84d79b0272.tar.gz`,S=`9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea`,me=1253570,C=`65ce1867f1b4339cc708bfb72a7d9a5942785632`,w=`a022eb6352156dcdcdf2f8730931f5891bd01436`,T=`/discovery/record-repeat.json`,E=[`curl -fsSL -o record-repeat-job.tar.gz ${r}${x}`,`mkdir -p /tmp && tar -xzf record-repeat-job.tar.gz -C /tmp`,`cd /tmp/record-repeat-job`,`node bin/record-repeat.mjs sample --all`].join(`
`),D=[`node bin/record-repeat.mjs sample --recipe R-OPENAPI-PIN-IMPACT`,`node bin/record-repeat.mjs sample --recipe R-PRICE-UNIT-CASE`,`node bin/record-repeat.mjs sample --recipe R-CSV-KEYED-CHANGE`,`node bin/record-repeat.mjs sample --recipe R-FEED-LIVE-NOCHANGE`,`node bin/record-repeat.mjs sample --recipe R-PRICE-REFUSE-HTML`].join(`
`),O=[`node bin/record-repeat.mjs sample --recipe R-OPENAPI-PIN-IMPACT --write-next-run ./next-run.json`,`node bin/record-repeat.mjs run --from-next-run ./next-run.json \\`,`  --before ./vendor/s163-record-recipes/sources/openapi/museum/before.yaml \\`,`  --after ./vendor/s163-record-recipes/sources/openapi/museum/after.yaml \\`,`  --used ./vendor/s163-record-recipes/sources/openapi/museum/used-ops.pin.json`].join(`
`),he=`
      <h1>Compare OpenAPI ops, price rows, keyed CSV, and feeds offline</h1>
      <p>
        SameDayDesk publishes one portable package for four local source comparisons:
        OpenAPI used-operation impact, curated price/unit row change, keyed CSV drift,
        and RSS/Atom correction briefs. Parsers are pinned at
        <code>${C}</code>; recipes/sources at
        <code>${w}</code>. Run labeled samples or your own before/after
        files with Node. The CLI reads local files only; it does not fetch, charge, or schedule.
        Unsupported HTML and missing identity or units are refused, not invented.
      </p>
      <p>
        Machine discovery:
        <a href="${r}${T}">${r}${T}</a>.
        Archive: <a href="${r}${x}">${r}${x}</a>
        (sha256 <code>${S}</code>). <a href="${r}${x}">Download archive</a>.
      </p>
      <h2>Cold start</h2>
      <pre><code>${E}</code></pre>
      <h2>Labeled samples</h2>
      <pre><code>${D}</code></pre>
      <h2>Repeat via next-run manifest</h2>
      <pre><code>${O}</code></pre>
      <p>
        Paid observation jobs remain on
        <a href="${v}">/for-agents</a>.
      </p>
    `,ge=Object.freeze({path:b,title:de,description:fe,canonical:pe,crawlerHtml:he}),k=`/for-agents/distribution-repair`,_e=`Diagnose why a listed tool cannot run | SameDayDesk`,ve=`Download one portable package that turns caller-supplied listing snapshots and a baseline/current route pair into an explainable diagnosis and owner repair guidance. Runs offline on the files you supply. Incomplete captures cannot prove a listing was removed everywhere.`,ye=`${r}${k}`,A=e.archive,j=e.sha256,be=e.bytes,M=e.discovery,N=e.record04,P=e.dist08,F=e.nl06,I=[`curl -fsSL -o distribution-repair.tar.gz ${r}${A}`,`mkdir -p /tmp && tar -xzf distribution-repair.tar.gz -C /tmp`,`cd /tmp/distribution-repair`,`node bin/distribution-repair.mjs sample --positive`].join(`
`),L=[`node bin/distribution-repair.mjs schema`,`node bin/distribution-repair.mjs diagnose ./examples/caller/alpha.json`,`node bin/distribution-repair.mjs diagnose ./examples/caller/beta.json`,`node bin/distribution-repair.mjs sample --partial`,`node bin/distribution-repair.mjs sample --mismatch`].join(`
`),R=[`node bin/distribution-repair.mjs diagnose ./examples/positive.json --write-next-run ./next-run.json`,`node bin/distribution-repair.mjs diagnose ./examples/next-run/input-after-docs-fix.json`].join(`
`),xe=`
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
        <a href="${r}${M}">${r}${M}</a>.
        <a href="${r}${A}">Download archive</a>
        (sha256 <code>${j}</code>).
        Source pins: <code>${N}</code>,
        <code>${P}</code>,
        <code>${F}</code>.
      </p>
      <h2>Cold start</h2>
      <pre><code>${I}</code></pre>
      <h2>Caller-shaped inputs</h2>
      <pre><code>${L}</code></pre>
      <h2>Repeat after a route correction</h2>
      <pre><code>${R}</code></pre>
      <p>
        Paid observation jobs remain on
        <a href="${v}">/for-agents</a>.
      </p>
    `,Se=Object.freeze({path:k,title:_e,description:ve,canonical:ye,crawlerHtml:xe}),z=`/for-agents/consumer-repeat`,Ce=`Run local consumer evidence jobs offline | SameDayDesk`,we=`Download one portable package for local evidence jobs: release brief, table reconcile, procurement brief, and related checks. Verify size and sha256 before extract. Supply your own files and an operator clock. Local provenance is integrity metadata, not an attestation.`,Te=`${r}${z}`,B=t.archive,V=t.sha256,H=t.bytes,U=t.discovery,W=t.sourceRepo,Ee=t.sourceCommit,G=t.reviewedSource;t.packageId;function De({siteOrigin:e=r,archivePath:t=B,bytes:n=H,sha256:i=V}={}){return[`s178_consumer_repeat_acquire() {`,'  local origin="${S178_CONSUMER_REPEAT_ORIGIN:-${1:-'+e+`}}"`,`  local bytes=`+String(n),`  local sha=`+i,`  local work tgz root`,'  work=$(mktemp -d "${TMPDIR:-/tmp}/s178-consumer-repeat.XXXXXX") || return 1',`  tgz="$work/s178-consumer-repeat-kit.tgz"`,`  root="$work/s178-consumer-repeat-kit"`,`  curl -fsSL --max-time 60 -o "$tgz" "$origin`+t+`" || { rm -rf "$work"; return 1; }`,`  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write("size %s != %s\\n" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write("sha256 %s != %s\\n" % (h, sys.argv[3])) or 1))' "$tgz" "$bytes" "$sha" || { rm -rf "$work"; return 1; }`,`  tar -xzf "$tgz" -C "$work" || { rm -rf "$work"; return 1; }`,`  [ -f "$root/bin/s178-cli.mjs" ] || { rm -rf "$work"; return 1; }`,`  (cd "$root" && node bin/s178-cli.mjs list >&2) || { rm -rf "$work"; return 1; }`,`  printf '%s\\n' "$root"`,`  return 0`,`}`,`kit=$(s178_consumer_repeat_acquire) || exit 1`,`printf '%s\\n' "$kit"`].join(`
`)}var Oe=De(),ke=[`node "$kit/bin/s178-cli.mjs" list`,`node "$kit/bin/s178-cli.mjs" example release-brief --kind conflict`,`node "$kit/bin/s178-cli.mjs" run 07 --clock 2026-09-10T18:00:00.000Z`,`node "$kit/bin/s178-cli.mjs" run release-brief --clock 2026-09-10T18:00:00.000Z`].join(`
`),Ae=[`node "$kit/bin/s178-cli.mjs" run 07 --in "$PWD/caller-a.json" --clock 2026-09-10T18:00:00.000Z`,`node "$kit/bin/s178-cli.mjs" run release-brief --in "$PWD/caller-b.json" --clock 2026-09-10T18:00:00.000Z`].join(`
`),je=[`node "$kit/bin/s178-cli.mjs" run release-brief --in "$PWD/caller-partial.json" --clock 2026-09-10T18:00:00.000Z > "$PWD/repeat-note.json"`,`node "$kit/bin/s178-cli.mjs" run release-brief --in "$PWD/caller-reconciled.json" --clock 2026-09-10T18:00:00.000Z`].join(`
`),Me=`
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
        <a href="${r}${U}">${r}${U}</a>.
        Archive: <a href="${r}${B}">${r}${B}</a>
        (${H} bytes, sha256 <code>${V}</code>).
        Source <code>${W}</code> at
        <code>${Ee}</code>. Reviewed package source
        <code>${G}</code>.
        <a href="${r}${B}">Download archive</a>.
      </p>
      <h2>Cold start (verify before extract)</h2>
      <pre><code>${Oe}</code></pre>
      <h2>Labeled samples (not caller files)</h2>
      <pre><code>${ke}</code></pre>
      <h2>Caller files</h2>
      <pre><code>${Ae}</code></pre>
      <h2>Changed-input repeat</h2>
      <pre><code>${je}</code></pre>
      <p>
        Material limit: you must supply an operator clock. Local provenance files are
        integrity metadata, not an independent attestation, and <code>ok:true</code> is
        honest completion rather than a pass. Announced, shipped, and tested stay distinct.
        Paid observation jobs remain on
        <a href="${v}">/for-agents</a>.
      </p>
    `,Ne=Object.freeze({path:z,title:Ce,description:we,canonical:Te,crawlerHtml:Me}),Pe=`/for-agents/useful-jobs`,Fe=`Offline useful jobs for agent callers | SameDayDesk`,Ie=`Ten offline jobs for lockfile changes, JSON Schema drift, route changes, page changes, pricing snapshots, API upgrades, feed agendas, CI evidence, listing repairs, and repeat-job records. Download and verify the archive, then run on Node 22 with your own files. Free local package; not hosted execution.`,Le=`Release 1.4.7 adds fresh verification for lockfile-pin-delta, json-schema-webhook-drift, route-table-diff, page-change-offline-job, and vendor-budget-impact. The other five jobs are carried forward without a new review.`,Re=Ie,ze=`${r}${Pe}`,K=n.archive,q=n.sha256,J=n.bytes,Y=n.discovery,X=n.catalog,Z=n.outcomes,Be=n.sourceRepo,Ve=n.sourceCommit,He=n.archiveFreeze,Ue=n.reviewedSource,We=n.rootName,Ge=n.cli;Object.freeze([...n.jobs]);var Q=Object.freeze([`bash`,`curl`,`python3`,`tar`,`mktemp`]),Ke=`Node >= 22 (offline after extract)`;function qe({siteOrigin:e=r,archivePath:t=K,bytes:n=J,sha256:i=q,rootName:a=We,cli:o=Ge}={}){let ee=String(t).split(`/`).filter(Boolean).pop()||`${a}.tar.gz`;return[`useful_jobs_acquire() {`,'  local origin="${USEFUL_JOBS_ORIGIN:-${1:-'+e+`}}"`,`  local bytes=`+String(n),`  local sha=`+i,`  local work tgz root`,'  work=$(mktemp -d "${TMPDIR:-/tmp}/useful-jobs.XXXXXX") || return 1',`  tgz="$work/`+ee+`"`,`  root="$work/`+a+`"`,`  curl -fsSL --max-time 60 -o "$tgz" "$origin`+t+`" || { rm -rf "$work"; return 1; }`,`  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write("size %s != %s\\n" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write("sha256 %s != %s\\n" % (h, sys.argv[3])) or 1))' "$tgz" "$bytes" "$sha" || { rm -rf "$work"; return 1; }`,`  tar -xzf "$tgz" -C "$work" || { rm -rf "$work"; return 1; }`,`  [ -f "$root/`+o+`" ] || { rm -rf "$work"; return 1; }`,`  (cd "$root" && node `+o+` list >&2) || { rm -rf "$work"; return 1; }`,`  printf '%s\\n' "$root"`,`  return 0`,`}`,`kit=$(useful_jobs_acquire) || exit 1`,`printf '%s\\n' "$kit"`].join(`
`)}var $=qe();Object.freeze([$]);var Je=[`node "$kit/bin/useful-jobs.mjs" list`,`node "$kit/bin/useful-jobs.mjs" help`,`node "$kit/bin/useful-jobs.mjs" help lockfile-pin-delta`,`node "$kit/bin/useful-jobs.mjs" help api-upgrade-brief`].join(`
`),Ye=[`node "$kit/bin/useful-jobs.mjs" run lockfile-pin-delta --example`,`node "$kit/bin/useful-jobs.mjs" run json-schema-webhook-drift --example`,`node "$kit/bin/useful-jobs.mjs" run route-table-diff --example --out-dir "$PWD/out/route-example"`,`node "$kit/bin/useful-jobs.mjs" run page-change-offline-job --job "$kit/samples/page/h04-page-01/job.json" --out-dir "$PWD/out/page-h04"`,`node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief --example`,`node "$kit/bin/useful-jobs.mjs" run vendor-budget-impact --example`,`node "$kit/bin/useful-jobs.mjs" run feed-agenda --example`,`node "$kit/bin/useful-jobs.mjs" run evidence-ci-annotation --example`,`node "$kit/bin/useful-jobs.mjs" run listing-repair-packet --example`,`node "$kit/bin/useful-jobs.mjs" run repeat-job-record --example`].join(`
`),Xe=[`node "$kit/bin/useful-jobs.mjs" run lockfile-pin-delta \\`,`  --before "$kit/samples/lockfile/h04-pub-lock-01/before.json" \\`,`  --after "$kit/samples/lockfile/h04-pub-lock-01/after.json" \\`,`  --out-dir "$PWD/out/h04-lock"`,`node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief \\`,`  --before "$kit/samples/openapi/caller-alpha/before.yaml" \\`,`  --after "$kit/samples/openapi/caller-alpha/after.yaml" \\`,`  --used "$kit/samples/openapi/caller-alpha/used.json" \\`,`  --out-dir "$PWD/out/caller-alpha"`,`node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief \\`,`  --before "$kit/samples/openapi/caller-beta/before.yaml" \\`,`  --after "$kit/samples/openapi/caller-beta/after.yaml" \\`,`  --used "$kit/samples/openapi/caller-beta/used.json" \\`,`  --out-dir "$PWD/out/caller-beta"`].join(`
`),Ze=[`cp "$kit/samples/openapi/caller-alpha/after.yaml" "$PWD/caller-alpha-after-edit.yaml"`,`printf '\\n# operator edit\\n' >> "$PWD/caller-alpha-after-edit.yaml"`,`node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief \\`,`  --before "$kit/samples/openapi/caller-alpha/before.yaml" \\`,`  --after "$PWD/caller-alpha-after-edit.yaml" \\`,`  --used "$kit/samples/openapi/caller-alpha/used.json" \\`,`  --out-dir "$PWD/out/caller-alpha-repeat"`].join(`
`),Qe=`
      <h1>Offline useful jobs for agent callers</h1>
      <p>
        Turn changing files into useful next steps. ${Ie}
      </p>
      <p>
        Machine discovery:
        <a href="${r}${Y}">${r}${Y}</a>.
        Catalog:
        <a href="${r}${X}">${r}${X}</a>.
        Outcomes:
        <a href="${r}${Z}">${r}${Z}</a>.
        Archive: <a href="${r}${K}">${r}${K}</a>
        (${J} bytes, sha256 <code>${q}</code>).
        Source <code>${Be}</code> at
        <code>${Ve}</code>. Archive freeze
        <code>${He}</code>. Reviewed source
        <code>${Ue}</code>.
        Acquire tools: <code>${Q.join(`, `)}</code>.
        Runtime after extract: <code>${Ke}</code>.
        <a href="${r}${K}">Download archive</a>.
      </p>
      <h2>Install / cold start (verify before extract)</h2>
      <pre><code>${$}</code></pre>
      <h2>List and help</h2>
      <pre><code>${Je}</code></pre>
      <h2>Labeled SAMPLE examples (not caller files)</h2>
      <pre><code>${Ye}</code></pre>
      <h2>Two different callers</h2>
      <pre><code>${Xe}</code></pre>
      <h2>Changed-file repeat</h2>
      <pre><code>${Ze}</code></pre>
      <p>
        Scope: free local package only. Missing inputs or digest mismatch stop the job.
        Partial vendor or listing evidence stays non-final. Evidence CI annotations from
        caller packets stay unattested. This package does not run hosted extract.
        ${Le}
      </p>
    `,$e=Object.freeze({path:Pe,title:Fe,description:Re,canonical:ze,crawlerHtml:Qe}),et=Object.freeze({path:_,title:ne,description:re,canonical:v,crawlerHtml:le}),tt=Object.freeze({path:ie,title:ae,description:oe,canonical:se,crawlerHtml:ue}),nt={wrap:`_wrap_9vusu_1`,hero:`_hero_9vusu_7`,h1:`_h1_9vusu_12`,jobH1:`_jobH1_9vusu_13`,lead:`_lead_9vusu_25`,actions:`_actions_9vusu_32`,primary:`_primary_9vusu_39`,secondary:`_secondary_9vusu_40`,badge:`_badge_9vusu_61`,section:`_section_9vusu_78`,delegation:`_delegation_9vusu_79`,sellerOffer:`_sellerOffer_9vusu_80`,marketEvidence:`_marketEvidence_9vusu_81`,connect:`_connect_9vusu_82`,note:`_note_9vusu_83`,sectionHead:`_sectionHead_9vusu_88`,eyebrow:`_eyebrow_9vusu_117`,offerCard:`_offerCard_9vusu_124`,delegationIntro:`_delegationIntro_9vusu_155`,flow:`_flow_9vusu_161`,taskmarketGrid:`_taskmarketGrid_9vusu_174`,taskmarketCard:`_taskmarketCard_9vusu_179`,grid:`_grid_9vusu_197`,card:`_card_9vusu_207`,cardTop:`_cardTop_9vusu_213`,inlineLink:`_inlineLink_9vusu_256`,commands:`_commands_9vusu_267`,jobCopy:`_jobCopy_9vusu_298`,jobPre:`_jobPre_9vusu_311`};export{J as $,_ as A,S as B,P as C,R as D,N as E,a as F,w as G,T as H,d as I,h as J,O as K,p as L,i as M,u as N,Se as O,o as P,K as Q,x as R,M as S,F as T,D as U,E as V,C as W,r as X,m as Y,Q as Z,te as _,H as a,Y as at,j as b,Oe as c,Z as ct,je as d,Ke as dt,He as et,G as f,$e as ft,s as g,ce as gt,W as h,tt as ht,B as i,$ as it,et as j,l as k,U as l,Ze as lt,Ee as m,Be as mt,g as n,Xe as nt,V as o,Ye as ot,Ne as p,Ve as pt,ge as q,f as r,X as rt,Ae as s,Je as st,nt as t,q as tt,ke as u,Ue as ut,A as v,L as w,I as x,be as y,me as z};