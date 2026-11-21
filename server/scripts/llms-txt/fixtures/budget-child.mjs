// Child for the open-handles test: a real server that accepts and never answers.
// Real shared transport, public admission and sockets; only the wire is routed
// to the fixture. No private-IP bypass and no forced server/socket cleanup.
import http from "node:http";
import { discoverSiteUrls } from "../../../lib/agent-readiness/sitemap-discovery.js";
import { createRequestBudget, setTransportForTests } from "../../../lib/agent-readiness/bounded-fetch.js";
import { PUBLIC_IP, wireSockets, transportResources } from "../../agent-readiness/fixtures/socket-controls.mjs";

const srv = http.createServer(() => { /* never respond */ });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
setTransportForTests(null);
const wiring = wireSockets([{ address: PUBLIC_IP, server: srv }]);
const origin = `http://hang.example:${port}`;
const budget = createRequestBudget(400);
const t0 = Date.now();
const r = await discoverSiteUrls({ origin, suppliedPaths: ["/a", "/b", "/c"], budget, lookup: async () => [{ address: PUBLIC_IP, family: 4 }] });
const elapsedMs = Date.now() - t0;
budget.dispose();
await new Promise((res) => srv.close(res));
wiring.restore();
const leaked = await transportResources();
console.log(JSON.stringify({ urls: r.urls, limited: r.limited, skipped: r.skipped, rejectedBudget: r.rejected.filter((x) => x.reason === "budget_exhausted").length, elapsedMs, leaked, attempts: wiring.attempts }));
