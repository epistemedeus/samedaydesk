# Free Check v2

Preview only until the focused tests, real-site calibration, G1 and changed-page
screenshots are received and Root obtains the operator's preview review. Root
owns production flags and deployment. The two non-card flags remain off.

The existing `GET /api/tools/ai-readiness` defaults to version 2. `version=1`
retains the six-check HTTP contract, `/scan` and the existing MCP caller. All
results carry a version. `stream=1` returns SSE progress and one final result;
`report=<32 lower-case hexadecimal characters>` reads a stored result. The
browser uses the same stream parser on the homepage and full tool page.

Forty fixed rules total 100 points: access 20, understanding 30, speed/mobile 10,
answers 15 and actions 25. Reading is therefore 60. Rules and weights have a
version and SHA256. Every observed deduction includes a URL and evidence. An
optional integration is an Upgrade. A request that did not complete, a missing
browser measurement or unavailable CrUX record is Not verified. Unknown points
are shown separately; the score is verified points, not an invented site grade.
Without a verified action route it is capped at 75. A documented contract is
not a claim that a payment, sign-in, tool invocation or delivery was exercised.

Reuse: parse5 reads HTML; robots-parser implements path-specific robots matching;
the existing bounded public fetcher pins admitted DNS addresses on every redirect,
keeps normal TLS validation, closes owned sockets and bounds bodies and lifetime.
Its optional HEAD and public user-agent parameters preserve existing defaults.
Response headers are opt-in and allowlisted, excluding cookies and credentials.
The maintained agent-payment-integrity parser at 4d110186a9ddbd3de5ce74f06540c145455c2f2a
(tested source dd9fb16f6ee64153b9f44fac19f45a1c9660399a, actual minimum Node 22.12.0)
is consumed unchanged for x402 network/address validation, including Solana. The
qualified five-address-profile nginx402 result belongs to that owner; this check
does not inherit its real-world result or hide its separate OpenAPI size limit.

Primary rule references: RFC 9309; Google's crawler and Google-Extended docs;
OpenAI's bot documentation; schema.org's getting-started guide; CrUX API docs.
Google-Extended and Applebot-Extended are control tokens. Their parent crawler
user agents are requested and labelled separately. Training opt-outs are not
search failures. User-agent requests are actual HTTP requests from this checker,
not verified Google/OpenAI crawler IPs and not Search Console or indexing proof.
JSON-LD syntax and observed fields do not establish rich-result eligibility.

The production checker never submits forms or follows purchase actions by GET.
It uses HEAD for a linked purchase/booking destination and machine-guide links.
Initial-HTML labels are checked; the complete browser accessibility tree, first
screen, JavaScript-created forms, wallet availability and settlement are not
inferred. Without an injected browser measurement, rendered comparison is Not
verified. CrUX uses only an already-enrolled SDS_FREE_CHECK_CRUX_API_KEY; absent
key or absent data stays Not verified. No key or project is created.

One total 18000 ms request budget covers retrieval. The browser stops at 20000 ms.
The existing client-rate limiter and a four-request active limit bound work. No
resident process or polling service is added. Public reports are small JSON files
in the private directory SDS_FREE_CHECK_REPORT_DIR, default
~/.samedaydesk-free-check/reports, owned by the app user, 0700 parent and 0600 files.
Only random IDs are accepted; symlinks and traversal are refused. Reports expire
after 30 days, with at most 1000 retained during writes. Atomic writes preserve
complete results. A storage error returns the useful report with an explicit
missing-permalink notice. Query values and credentials are never retained from
the input URL. These reports contain public web evidence, not private payer data.

The frozen 30-site target list is in scripts/free-check-v2/calibration-targets.json.
Calibration keeps every actual refusal, timeout and unknown. It records the rule
hash, source, public status, score, unknown points and milliseconds. Scores are
not tuned after looking at a brand. An observed false finding needs a rule repair
and replay, with predecessor evidence preserved. Real-site quality is adjudicated
from those observations, not fixture pass counts. The Shopify and local-business
examples need received platform/location evidence before their category is claimed.

All v2 installation, build, browser, tests and calibration run on fresh boot
a9c17957-b3f6-4e6e-88f5-a4f197cbcdbb. The source/model author remains in the original
native chat on boot 7248a61c-22d5-42fa-9287-de751af029cd. No new remote model session
is claimed. The finite source-closed runner records actual step exits and exports
private evidence; no useful existing job is killed or recreated.

The final input includes the independently qualified cursor/bank cut 322afd7b,
its two heading-gap fixes, both case-study dark contrast repairs, and the
blocking G1 gate immediately after links. Its 10/10, managed and screenshot
receipts remain separate. The fresh program runs v2's own 10 gates and report
states; it does not rerun the historical red cursor source.
