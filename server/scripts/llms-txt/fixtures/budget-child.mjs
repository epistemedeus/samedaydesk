// Child for the open-handles test: a real server that accepts and never answers.
// Real probe.js rawExchange sockets; URL host rewritten to 127.0.0.1 after the guard
// (an IP host skips lookup), so the hang is a genuine socket wait.
import http from "node:http";
import { discoverSiteUrls } from "../../../lib/agent-readiness/sitemap-discovery.js";
import { createRequestBudget, setTransportForTests } from "../../../lib/agent-readiness/bounded-fetch.js";
import { rawExchange } from "../../../lib/agent-readiness/probe.js";

const srv = http.createServer(() => { /* never respond */ });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
setTransportForTests((url, o) => rawExchange(new URL(url.pathname, `http://127.0.0.1:${port}`), { ...o, timeoutMs: 60_000 }));
const origin = `http://hang.example:${port}`;
const budget = createRequestBudget(400);
const t0 = Date.now();
const r = await discoverSiteUrls({ origin, suppliedPaths: ["/a", "/b", "/c"], budget, lookup: async () => [{ address: "93.184.216.34", family: 4 }] });
const elapsedMs = Date.now() - t0;
budget.dispose();
await new Promise((res) => { srv.closeAllConnections(); srv.close(res); });
await new Promise((res) => setImmediate(res));
const leaked = process.getActiveResourcesInfo().filter((x) => /TCP|Timeout|GetAddrInfo/.test(x));
console.log(JSON.stringify({ urls: r.urls, limited: r.limited, skipped: r.skipped, rejectedBudget: r.rejected.filter((x) => x.reason === "budget_exhausted").length, elapsedMs, leaked }));
