// Offline automatic generation for the committed Krabka #132 fixture.
// Prints the coverage label. Exits 0 when /docs/quickstart is in the llms.txt.
// Deploy is not part of this command.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock } from "node:test";
import dns from "node:dns/promises";
import express from "express";
import router from "../../routes/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const mod = await import(pathToFileURL(path.join(here, "fetch-transport.js")).href);
  mod.installFetchTransport();
} catch (e) {
  if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
}

const realFetch = globalThis.fetch;
const fxDir = path.join(here, "fixtures", "krabka-132");
const fx = (name) => fs.readFileSync(path.join(fxDir, name), "utf8");
const pages = JSON.parse(fx("pages.json"));
const O = "https://krabka.io";
const pageHtml = (title, description = "") =>
  `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body></body></html>`;

mock.method(dns, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost")) return realFetch(url, opts);
  const urlObj = new URL(u);
  let body = null;
  let xml = false;
  if (urlObj.origin === O) {
    if (urlObj.pathname === "/" || urlObj.pathname === "") body = fx("home.min.html");
    else if (urlObj.pathname === "/robots.txt") { body = fx("robots.txt"); xml = false; }
    else if (urlObj.pathname === "/sitemap-index.xml") { body = fx("sitemap-index.xml"); xml = true; }
    else if (urlObj.pathname === "/sitemap-0.xml") { body = fx("sitemap-0.xml"); xml = true; }
    else if (urlObj.pathname !== "/sitemap.xml") {
      const known = pages.find((p) => p.url.replace(/\/+$/, "") === u.replace(/\/+$/, ""));
      body = pageHtml(known?.title || "Page", known?.description || "");
    }
  }
  if (body == null) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  const headers = xml || String(body).includes("<urlset") || String(body).includes("<sitemapindex")
    ? { "content-type": "application/xml" }
    : { "content-type": "text/html; charset=utf-8" };
  return new Response(body, { status: 200, headers });
};

const app = express();
app.use(router);
const srv = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
try {
  const res = await realFetch(`http://127.0.0.1:${srv.address().port}/llms-txt?url=${encodeURIComponent(O)}`);
  const json = await res.json();
  const quickstart = json.llmsTxt?.includes("/docs/quickstart");
  const ste = "> krabka is an Apache 2.0 broker in safe Rust. It is compatible with the Kafka wire protocol. It has its own KRaft quorum and clients for Rust, Go, and Java.";
  process.stdout.write(`status ${res.status}\n`);
  process.stdout.write(`COVERAGE ${json.discovery?.coverage?.label || ""}\n`);
  process.stdout.write(`QUICKSTART ${quickstart ? "present" : "absent"}\n`);
  process.stdout.write(`STE ${json.llmsTxt?.includes(ste) ? "present" : "absent"}\n`);
  process.stdout.write(`GITHUB ${json.llmsTxt?.includes("github.com") ? "present" : "absent"}\n`);
  process.stdout.write(`COUNT ${json.count} TOTAL ${json.totalFound} OMITTED ${json.omitted}\n`);
  if (res.status !== 200 || !quickstart) process.exitCode = 1;
} finally {
  srv.close();
  globalThis.fetch = realFetch;
  mock.restoreAll();
}
