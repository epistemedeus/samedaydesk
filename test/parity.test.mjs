import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { offers, renderHomeJsonLd, renderSitemap, routes } from "../scripts/generate-machine-layer.mjs";

const root = process.cwd();

function runParity(cwd = root) {
  try {
    const out = execFileSync(process.execPath, [path.join(cwd, "scripts/parity-check.mjs")], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
}

// A working copy of only the files the gate reads, so a fixture can be broken safely.
function fixtureTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-parity-"));
  for (const rel of ["shared", "scripts", "client/public", "client/src/lib", "server", "test"]) {
    fs.cpSync(path.join(root, rel), path.join(dir, rel), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, "client/dist"), { recursive: true });
  return dir;
}

test("the gate passes on the real tree", () => {
  const r = runParity();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /every published surface matches the record/);
});

test("the gate fails when a human price appears on the homepage", () => {
  const dir = fixtureTree();
  const home = path.join(dir, "client/public/home.html");
  fs.writeFileSync(home, fs.readFileSync(home, "utf8").replace("<h1>A desk for agent-era commerce.</h1>", "<h1>A desk for agent-era commerce. $490</h1>"));
  const r = runParity(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /human price \$490 on \/|human dollar price/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the gate fails when a pay card loses its exclusion line", () => {
  const dir = fixtureTree();
  const card = path.join(dir, "client/public/pay/sprint.html");
  fs.writeFileSync(card, fs.readFileSync(card, "utf8").replace("Bounded implementation of a frozen list. This is not a retainer and not a citation guarantee.", "Great value."));
  const r = runParity(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /does not print its exclusion line/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the gate fails when a banned phrase reaches a money page", () => {
  const dir = fixtureTree();
  const home = path.join(dir, "client/public/home.html");
  fs.writeFileSync(home, fs.readFileSync(home, "utf8").replace("<h1>A desk for agent-era commerce.</h1>", "<h1>We will get you cited</h1>"));
  const r = runParity(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /banned phrase/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the gate fails when an em dash reaches a file this build owns", () => {
  const dir = fixtureTree();
  const terms = path.join(dir, "client/public/terms.html");
  fs.writeFileSync(terms, fs.readFileSync(terms, "utf8").replace("<h2>1. Business days</h2>", "<h2>1. Business days \u2014 read this</h2>"));
  const r = runParity(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /em or en dash/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the gate fails when the sitemap drifts from the route manifest", () => {
  const dir = fixtureTree();
  const sitemap = path.join(dir, "client/public/sitemap.xml");
  fs.writeFileSync(sitemap, fs.readFileSync(sitemap, "utf8").replace("<loc>https://samedaydesk.com/methods</loc>", "<loc>https://samedaydesk.com/methodz</loc>"));
  const r = runParity(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /sitemap/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the gate fails when homepage JSON-LD drifts from the generator", () => {
  const dir = fixtureTree();
  const home = path.join(dir, "client/public/home.html");
  const html = fs.readFileSync(home, "utf8");
  fs.writeFileSync(home, html.replace('"legalName": "Neomorphic LLC"', '"legalName": "Some Other LLC"'));
  const r = runParity(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /JSON-LD is stale|legalName does not match/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the homepage assertions stay quiet when the homepage does not exist yet", () => {
  const dir = fixtureTree();
  fs.rmSync(path.join(dir, "client/public/home.html"));
  const r = runParity(dir);
  assert.match(r.out, /homepage assertions skipped/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("homepage schema is Organization and WebSite only", () => {
  const record = offers();
  const home = fs.readFileSync(path.join(root, "client/public/home.html"), "utf8");
  const jsonld = JSON.parse(renderHomeJsonLd(record, home));
  const types = jsonld["@graph"].map((n) => n["@type"]).sort();
  assert.deepEqual(types, ["Organization", "WebSite"]);
  assert.equal(jsonld["@graph"].find((n) => n["@type"] === "Organization").legalName, record.site.legal_name);
});

test("the sitemap renderer emits every route and nothing else", () => {
  const routeRecord = routes();
  const xml = renderSitemap(routeRecord);
  assert.equal((xml.match(/<loc>/g) || []).length, routeRecord.routes.length);
  for (const dead of Object.keys(routeRecord.redirects)) assert.ok(!xml.includes(`${routeRecord.base}${dead}<`));
});
