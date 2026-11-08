import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import Ajv2020 from "ajv/dist/2020.js";
import { mountApexDeclarations } from "../../lib/apex-declarations.js";
import { runDocumentationReadiness } from "../../lib/agent-readiness/documentation.js";
import { PUBLIC_IP, closeServer, localServer, publicLookup, wireSockets } from "./fixtures/socket-controls.mjs";
import { createAgentReadinessRouter } from "../../routes/agent-readiness.js";

test("documentation JSON is explicitly selected and never falls through to the capability checker", async (t) => {
  const docs = { schema: "agent-readiness.documentation.v1", checks: [], topFixes: [] };
  const legacy = {
    schema: "agent-readiness.report.v1", host: "docs.example.org", score: 42,
    checks: [], categories: [], topFixes: [],
  };
  const app = express();
  let legacyCalls = 0;
  let docsCalls = 0;
  app.use("/agent-readiness", createAgentReadinessRouter({
    run: async () => { legacyCalls++; return { payload: legacy, fixPack: "# Existing fix pack" }; },
    runDocumentation: async (host, options) => {
      assert.equal(host, "docs.example.org");
      assert.ok(options.clientKey);
      docsCalls++;
      if (docsCalls > 1) throw Object.assign(new Error("Try later"), { status: 429, retryAfterSec: 9 });
      return docs;
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const get = (query) => fetch(`http://127.0.0.1:${server.address().port}/agent-readiness?${query}`);
  const path = "format=documentation";
  assert.equal((await get(path)).status, 400);
  const report = await get(`${path}&host=docs.example.org`);
  assert.equal(report.status, 200);
  assert.equal(report.headers.get("cache-control"), "no-store");
  assert.deepEqual(await report.json(), docs);
  const limited = await get(`${path}&host=docs.example.org`);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "9");
  assert.equal(legacyCalls, 0);
  const json = await get("host=docs.example.org&format=json");
  assert.deepEqual(await json.json(), legacy);
  const fixPack = await get("host=docs.example.org&format=fix-pack");
  assert.match(fixPack.headers.get("content-type"), /^text\/markdown/);
  assert.equal(await fixPack.text(), "# Existing fix pack");
  const html = await get("host=docs.example.org");
  assert.match(html.headers.get("content-type"), /^text\/html/);
  assert.match(await html.text(), /docs\.example\.org scored 42 \/ 100/);
  assert.equal(legacyCalls, 3);
  assert.equal(docsCalls, 2);
});

test("the mounted documentation report offers an unfetched text alternate and the caller can read it separately", async (t) => {
  const host = "docs.example.org";
  const origin = `http://${host}`;
  const seen = [];
  let advertise = true;
  const upstream = await localServer((req, res) => {
    seen.push([req.method, req.url, req.headers.host]);
    switch (req.url) {
      case "/":
        res.setHeader("Content-Type", "text/html");
        if (advertise) res.setHeader("Link", [
          '</llms.txt>; rel=describedby; type="text/plain"',
          '</results.md>; title="untrusted, private-label"; rel=alternate; type="text/markdown"',
        ]);
        res.end("<html><body>" + "x".repeat(256_001) + "</body></html>");
        break;
      case "/robots.txt":
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(`Sitemap: ${origin}/index.xml\n`);
        break;
      case "/index.xml":
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(`<urlset><url><loc>${origin}/doc</loc></url></urlset>`);
        break;
      case "/llms.txt":
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("# Fixture documentation\n");
        break;
      case "/results.md":
        res.writeHead(200, { "Content-Type": "text/markdown" });
        res.end("# Scraping benchmark\n\nRun identity: scraping-bench-v6:2026-11-07\nMeasure: page access\n");
        break;
      default:
        res.writeHead(404).end();
    }
  });
  t.after(() => closeServer(upstream));
  const wiring = wireSockets([{ address: PUBLIC_IP, port: 80, server: upstream }]);
  t.after(() => wiring.restore());

  const app = express();
  mountApexDeclarations(app);
  app.use("/agent-readiness", createAgentReadinessRouter({
    runDocumentation: (input, options) => runDocumentationReadiness(input, {
      ...options,
      lookup: (hostname) => {
        assert.equal(hostname, host);
        return publicLookup();
      },
    }),
  }));
  const server = await localServer(app);
  t.after(() => closeServer(server));
  const base = `http://127.0.0.1:${server.address().port}`;
  const openApi = await fetch(base + "/openapi.json");
  assert.equal(openApi.status, 200);
  assert.match(openApi.headers.get("content-type"), /^application\/openapi\+json/);
  const schema = (await openApi.json()).paths["/agent-readiness"].get.responses["200"]
    .content["application/json"].schema;
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);

  const getReport = async () => {
    const response = await fetch(`${base}/agent-readiness?${new URLSearchParams({ host: origin, format: "documentation" })}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  };
  const report = await getReport();
  assert.deepEqual(report.nextAction, {
    kind: "read-declared-alternate", path: "/results.md", mediaTypeHint: "text/markdown", verified: false,
  });
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...report, nextAction: { ...report.nextAction, verified: true } }), false);
  assert.equal(validate({ ...report, nextAction: { ...report.nextAction, path: "//other.example/results.md" } }), false);
  assert.equal(report.origin, origin);
  assert.equal(report.schema, "agent-readiness.documentation.v1");
  assert.equal("score" in report, false);
  assert.deepEqual(report.checks.map(({ id, status }) => [id, status]), [
    ["homepage", "unknown"], ["sitemap-discovery", "pass"], ["llms-index", "pass"],
  ]);
  assert.deepEqual(report.evidence.find(({ path }) => path === "/"), {
    path: "/", httpStatus: 200, outcome: "budget", contentType: "text/html",
  });
  assert.doesNotMatch(JSON.stringify(report), /private-label|scraping-bench-v6/);
  const baseReads = ["/", "/index.xml", "/llms.txt", "/robots.txt"].map(path => ["GET", path, host]);
  assert.deepEqual(seen.splice(0).sort(), baseReads.sort());
  assert.equal(wiring.attempts.length, 4);

  advertise = false;
  const oldReport = await getReport();
  assert.equal(validate(oldReport), true, JSON.stringify(validate.errors));
  assert.equal("nextAction" in oldReport, false);
  const stable = ({ generatedAt, nextAction, ...fields }) => fields;
  assert.deepEqual(stable(oldReport), stable(report));
  assert.deepEqual(seen.splice(0).sort(), baseReads);
  assert.equal(wiring.attempts.length, 8);

  const target = new URL(report.nextAction.path, report.origin);
  const markdown = await new Promise((resolve, reject) => {
    http.get(target, {
      family: 4,
      lookup(hostname, _options, done) {
        assert.equal(hostname, host);
        done(null, PUBLIC_IP, 4);
      },
    }, (response) => resolve(response)).on("error", reject);
  });
  assert.equal(markdown.statusCode, 200);
  assert.equal(markdown.headers["content-type"], "text/markdown");
  const chunks = [];
  for await (const chunk of markdown) chunks.push(chunk);
  assert.match(Buffer.concat(chunks).toString(), /^Run identity: scraping-bench-v6:2026-11-07$/m);
  assert.deepEqual(seen, [["GET", "/results.md", host]]);
  assert.equal(wiring.attempts.length, 9);
});
