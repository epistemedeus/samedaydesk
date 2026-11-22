// A VM-side worker the web host can call: POST /render {url, initialWords} with a bearer token.
// One render at a time, a short queue, nothing stored. The web host keeps its 20 s budget and treats
// any failure or timeout as Not verified.
//   FREE_CHECK_RENDER_TOKEN   required shared secret (host settings only; never logged)
//   PORT                      default 8787; binds to 127.0.0.1 unless HOST is set
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { render } from "./render.mjs";

const token = process.env.FREE_CHECK_RENDER_TOKEN;
if (!token || token.length < 32) throw Error("FREE_CHECK_RENDER_TOKEN of at least 32 characters is required.");
const expected = Buffer.from(`Bearer ${token}`);
const authorized = (header = "") => { const given = Buffer.from(header); return given.length === expected.length && timingSafeEqual(given, expected); };
let busy = false;
const waiting = [];
const MAX_WAITING = 3;
const turn = () => new Promise((resolve, reject) => { if (!busy) { busy = true; resolve(); } else if (waiting.length < MAX_WAITING) waiting.push(resolve); else reject(Error("busy")); });
const done = () => { const next = waiting.shift(); if (next) next(); else busy = false; };

http.createServer((req, res) => {
  const reply = (status, body) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body)); };
  if (req.method !== "POST" || req.url !== "/render") return reply(404, { error: "not found" });
  if (!authorized(req.headers.authorization)) return reply(401, { error: "unauthorized" });
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; if (raw.length > 4096) req.destroy(); });
  req.on("end", async () => {
    let input;
    try { input = JSON.parse(raw); new URL(input.url); } catch { return reply(400, { error: "send {url, initialWords}" }); }
    try { await turn(); } catch { return reply(429, { error: "busy" }); }
    try { reply(200, await render(input.url, { initialWords: Number(input.initialWords) || 0, budgetMs: 8_000 })); }
    catch (error) { reply(422, { error: error.message.slice(0, 200) }); }
    finally { done(); }
  });
}).listen(Number(process.env.PORT || 8787), process.env.HOST || "127.0.0.1");
