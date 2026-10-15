// Isolated process: real sockets/TLS/DNS, natural server close and process exit.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import dgram from "node:dgram";
import dns from "node:dns/promises";
import { readFileSync } from "node:fs";
import { rawExchange, guardedExchange } from "../../../lib/agent-readiness/probe.js";
import { createRequestBudget, fetchPublicBounded } from "../../../lib/agent-readiness/bounded-fetch.js";
import { PUBLIC_IP, publicLookup, listen, closeServer, wireSockets, transportResources } from "./socket-controls.mjs";

const mode = process.argv[2];
const out = { mode };
if (mode === "invalid") {
  try { await guardedExchange("invalid url"); throw new Error("invalid URL accepted"); }
  catch (e) { if (e.message === "invalid URL accepted") throw e; }
} else if (mode === "dns") {
  // Never answer the real A/AAAA requests. Abort must cancel their c-ares handles.
  const server = dgram.createSocket("udp4");
  let queries = 0;
  server.on("message", () => queries++);
  await new Promise((r) => server.bind(0, "127.0.0.1", r));
  dns.setServers([`127.0.0.1:${server.address().port}`]);
  const budget = createRequestBudget(100);
  try { await fetchPublicBounded("http://hanging-dns.example/", { budget }); }
  catch (e) { out.code = e.code; }
  finally { budget.dispose(); await new Promise((r) => server.close(r)); }
  out.queries = queries;
} else {
  const requests = [];
  const handler = (req, res) => {
    requests.push({ host: req.headers.host, servername: req.socket.servername, path: req.url, headers: req.headers });
    if (mode === "tls") return res.end("verified");
    if (mode === "redirect") { res.writeHead(302, { location: "/next" }); res.write("redirect-secret"); return; }
    if (mode === "error") { res.writeHead(503); res.write("error-secret"); return; }
    res.writeHead(200); res.write("partial"); // never complete the body
  };
  const server = mode === "tls"
    ? https.createServer({ key: readFileSync(new URL("./tls/key.pem", import.meta.url)), cert: readFileSync(new URL("./tls/cert.pem", import.meta.url)) }, handler)
    : mode === "tls-hang" ? net.createServer(() => {}) : http.createServer(handler);
  // A TCP listener used as a stalled TLS peer must read FIN to close naturally.
  if (mode === "tls-hang") server.on("connection", (socket) => socket.resume());
  const port = await listen(server);
  const wiring = wireSockets([{ address: PUBLIC_IP, server }]);
  try {
    const options = { address: { address: PUBLIC_IP, family: 4 }, timeoutMs: 100 };
    if (mode === "tls") {
      out.valid = await rawExchange(new URL(`https://pin.example:${port}/doc?q=1`), {
        ...options, timeoutMs: 1000, headers: { Host: "spoof.example", Authorization: "private", Cookie: "private" },
      });
      out.mismatch = await rawExchange(new URL(`https://wrong.example:${port}/`), { ...options, timeoutMs: 1000 });
    } else if (mode === "abort-body") {
      const budget = createRequestBudget(100);
      try { await fetchPublicBounded(`http://body.example:${port}/`, { lookup: publicLookup, budget }); }
      catch (e) { out.code = e.code; }
      finally { budget.dispose(); }
    } else {
      out.response = await rawExchange(new URL(`${mode === "tls-hang" ? "https" : "http"}://pin.example:${port}/`), options);
    }
    out.requests = requests;
    out.attempts = wiring.attempts;
  } finally { wiring.restore(); await closeServer(server); }
}
out.leaked = await transportResources();
console.log(JSON.stringify(out));
