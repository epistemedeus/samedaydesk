# Public HTTP transport

Both readiness probes (`guardedExchange`) and llms.txt generation
(`fetchPublicBounded`) use `ssrf.js` admission and `probe.js` `rawExchange`.
Keep connection ownership and disposal in that shared path.

Each hop admits **all** A/AAAA results, then connects to the selected numeric IP
using its own agent. A hostname-keyed global pool or a connect-time lookup must
never replace that decision. Literal URLs undergo the same checks before any
socket opens. HTTP Host and TLS servername remain the URL's authority; Node's
certificate trust and identity verification remain enabled.

The public resolver owns cancellable A/AAAA queries, using Node's configured
DNS servers rather than OS hosts/search aliases. Injected `lookup` functions
receive `signal` and should release their work on abort. Non-public, reserved,
documentation and transition addresses are refused; IPv6 HTTP destinations
are conservatively restricted to ordinary global unicast.

`createRequestBudget` owns a deadline and parent abort listener. DNS, connection,
TLS, redirects and body reads consume the same lifetime. A raw result settles
only after its request and socket close and its agent and timer are disposed.
Redirect/error responses return metadata with an empty body. A size limit is
reported as truncation; an aborted or broken body is a retrieval failure, even
if its HTTP status or prefix looks successful. The bounded consumer rejects
these failures, rather than producing a successful partial document.

Generator discovery policy remains in `sitemap-discovery.js`: automatic links
are same-origin; explicit public external references get anonymous allowlisted
headers and their own origin scope. The separate external-reference limit is
10. Coverage records declared outcomes and factual omissions per input.

Run the owning suites from the repository root:

```sh
npm run -s test:agent-readiness
node --test --test-concurrency=1 server/scripts/llms-txt/generator.test.js server/scripts/llms-txt/discovery-route.test.js server/scripts/llms-txt/transport.test.js
```

Real-socket controls in `shared-transport.test.js` include admission/pool
isolation, rebinding, interrupted and active bodies, redirects, TLS trust and
identity, cancellation of actual DNS queries, and natural child-process exit.
The Node 22 test helper records the numeric libuv connect address and routes
the wire to a local server. It does not bypass admission or stub HTTP/TLS.
Test certificates are public fixture material, trusted only by isolated test
children through `NODE_EXTRA_CA_CERTS`.

The former pinning-positive fixture supplied a forbidden loopback pin. Use a
public admitted pin with wire routing for positive tests, and assert refusal
for private pins including literal URLs. The old rebinding fixture's `100::1`
is discard-only, so use a separately wired public endpoint and a poisoned
system lookup. When checking cleanup, observe actual close/destruction and
natural process exit; one `setImmediate` may precede libuv's close notification.
