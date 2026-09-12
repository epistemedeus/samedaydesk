import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { FIXTURES_DIR } from "../lib/constants.mjs";
import { loadCatalogDocument } from "../lib/catalog.mjs";
import { diffRouteTables } from "../lib/diff.mjs";
import { parseStdout, runCli, tmpOut } from "./helpers.mjs";

const EXPRESS_FIXTURES = join(FIXTURES_DIR, "express5");

function readFixture(name) {
  return JSON.parse(readFileSync(join(EXPRESS_FIXTURES, name), "utf8"));
}

async function expressWitness(catalog, requests) {
  const app = express();
  app.set("case sensitive routing", catalog.settings.caseSensitive);
  app.set("strict routing", catalog.settings.strict);
  catalog.routes.forEach((route, index) => {
    const register = route.method.toUpperCase() === "ALL" ? "all" : route.method.toLowerCase();
    app[register](route.path, (request, response, next) => {
      response.locals.matched = [...(response.locals.matched || []), index];
      next();
    });
  });
  app.use((request, response) => {
    const matched = response.locals.matched || [];
    response.set("x-matched-routes", matched.join(","));
    response.status(matched.length ? 204 : 404).end();
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const results = [];
    for (const request of requests) {
      const response = await fetch(`${origin}${request.path}`, {
        method: request.method,
        redirect: "manual",
      });
      results.push({
        status: response.status,
        matched: response.headers.get("x-matched-routes") || "",
      });
    }
    return results;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function frameworkCatalog(routes, settings = { caseSensitive: false, strict: false }) {
  return {
    schema: "samedaydesk.route-table.express.v1",
    framework: { name: "express", major: 5 },
    settings,
    routes,
  };
}

test("Express 5 CLI: method case, parameter names, literal case, escaped colon, trailing slash, and wildcard names preserve matcher identity", async () => {
  const beforePath = join(EXPRESS_FIXTURES, "aliases-before.json");
  const afterPath = join(EXPRESS_FIXTURES, "aliases-after.json");
  const result = runCli(["--before", beforePath, "--after", afterPath, "--out-dir", tmpOut()]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.catalogKind, "express");
  assert.equal(body.framework.name, "express");
  assert.equal(body.framework.major, 5);
  assert.equal(body.breaking, false);
  assert.equal(body.outcome, "no-change");
  assert.deepEqual(body.counts, { added: 0, removed: 0, changed: 0, titleOnly: 0, collisions: 0 });
  assert.equal(body.tableDigest.before, body.tableDigest.after);

  const requests = [
    { method: "GET", path: "/users/42" },
    { method: "HEAD", path: "/USERS/ABC/" },
    { method: "POST", path: "/orders/a1/" },
    { method: "DELETE", path: "/clock:noon" },
    { method: "DELETE", path: "/clockXnoon" },
    { method: "PATCH", path: "/" },
    { method: "PATCH", path: "/a" },
    { method: "PATCH", path: "/a/b/" },
  ];
  const beforeMatches = await expressWitness(readFixture("aliases-before.json"), requests);
  const afterMatches = await expressWitness(readFixture("aliases-after.json"), requests);
  assert.deepEqual(beforeMatches, afterMatches);
  assert.deepEqual(beforeMatches.map((item) => item.status), [204, 204, 204, 204, 404, 404, 204, 204]);
});

test("Express 5 CLI: a method removal and parameter/static overlap are breaking with an actual matcher witness", async () => {
  const beforePath = join(EXPRESS_FIXTURES, "collision-before.json");
  const afterPath = join(EXPRESS_FIXTURES, "collision-after.json");
  const result = runCli(["--before", beforePath, "--after", afterPath, "--out-dir", tmpOut()]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.breaking, true);
  assert.equal(body.outcome, "breaking");
  assert.deepEqual(body.removed, [{ method: "POST", path: "/users/new" }]);
  assert.deepEqual(body.added, [{ method: "GET", path: "/users/new" }]);
  const collision = body.collisions.find((item) => item.kind === "request" && item.side === "after");
  assert.ok(collision);
  assert.deepEqual(collision.witness, { method: "GET", path: "/users/new" });

  const requests = [collision.witness, { method: "POST", path: "/users/new" }];
  const beforeMatches = await expressWitness(readFixture("collision-before.json"), requests);
  const afterMatches = await expressWitness(readFixture("collision-after.json"), requests);
  assert.deepEqual(beforeMatches, [
    { status: 204, matched: "0" },
    { status: 204, matched: "1" },
  ]);
  assert.deepEqual(afterMatches, [
    { status: 204, matched: "0,1" },
    { status: 404, matched: "" },
  ]);
});

test("Express 5 CLI: semantic duplicates collide even when parameter, case, and trailing-slash spelling differs", async () => {
  const beforePath = join(EXPRESS_FIXTURES, "duplicate-before.json");
  const afterPath = join(EXPRESS_FIXTURES, "duplicate-after.json");
  const body = parseStdout(runCli(["--before", beforePath, "--after", afterPath, "--out-dir", tmpOut()]));
  assert.equal(body.breaking, true);
  assert.deepEqual(body.added, []);
  assert.deepEqual(body.removed, []);
  const collision = body.collisions.find((item) => item.kind === "request" && item.side === "after");
  assert.deepEqual(collision.witness, { method: "GET", path: "/users/x" });
  const matches = await expressWitness(readFixture("duplicate-after.json"), [collision.witness]);
  assert.deepEqual(matches, [{ status: 204, matched: "0,1" }]);
});

test("Express 5 CLI: case and trailing slash changes are removals when both settings are strict", async () => {
  const beforePath = join(EXPRESS_FIXTURES, "strict-case-before.json");
  const afterPath = join(EXPRESS_FIXTURES, "strict-case-after.json");
  const result = runCli(["--before", beforePath, "--after", afterPath, "--out-dir", tmpOut()]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.breaking, true);
  assert.deepEqual(body.removed, [{ method: "GET", path: "/Case" }]);
  assert.deepEqual(body.added, [{ method: "GET", path: "/case/" }]);

  const requests = [
    { method: "GET", path: "/Case" },
    { method: "GET", path: "/case" },
    { method: "GET", path: "/case/" },
  ];
  assert.deepEqual(await expressWitness(readFixture("strict-case-before.json"), requests), [
    { status: 204, matched: "0" },
    { status: 404, matched: "" },
    { status: 404, matched: "" },
  ]);
  assert.deepEqual(await expressWitness(readFixture("strict-case-after.json"), requests), [
    { status: 404, matched: "" },
    { status: 404, matched: "" },
    { status: 204, matched: "0" },
  ]);
});

test("Express 5 library: wildcard and GET-to-HEAD collisions carry matcher-valid witnesses", async () => {
  const wildcardRaw = frameworkCatalog([
    { method: "GET", path: "/*tail" },
    { method: "GET", path: "/{*all}" },
  ]);
  const wildcard = loadCatalogDocument(wildcardRaw, "memory://wildcard");
  assert.deepEqual(wildcard.collisions[0].witness, { method: "GET", path: "/x" });
  assert.deepEqual(await expressWitness(wildcardRaw, [{ method: "GET", path: "/" }, wildcard.collisions[0].witness]), [
    { status: 204, matched: "1" },
    { status: 204, matched: "0,1" },
  ]);

  const headRaw = frameworkCatalog([
    { method: "GET", path: "/health" },
    { method: "HEAD", path: "/health/" },
  ]);
  const head = loadCatalogDocument(headRaw, "memory://head");
  assert.deepEqual(head.collisions[0].witness, { method: "HEAD", path: "/health" });
  assert.deepEqual(await expressWitness(headRaw, [head.collisions[0].witness, { method: "GET", path: "/health" }]), [
    { status: 204, matched: "0,1" },
    { status: 204, matched: "0" },
  ]);
});

test("Express 5 bounded matcher matrix: every reported overlap matches in Express and no corpus overlap is missed", async () => {
  const raw = frameworkCatalog([
    { method: "GET", path: "/" },
    { method: "GET", path: "/users/new" },
    { method: "GET", path: "/users/:id" },
    { method: "GET", path: "/:resource/new" },
    { method: "GET", path: "/:first/:second" },
    { method: "GET", path: "/files/*rest" },
    { method: "GET", path: "/*rest" },
    { method: "GET", path: "/{*all}" },
    { method: "GET", path: "/clock\\:noon" },
  ]);
  const catalog = loadCatalogDocument(raw, "memory://matrix");
  const requests = [
    { method: "GET", path: "/" },
    { method: "GET", path: "/users/new" },
    { method: "GET", path: "/users/x" },
    { method: "GET", path: "/x/new" },
    { method: "GET", path: "/x/y" },
    { method: "GET", path: "/files/x" },
    { method: "GET", path: "/files/x/y" },
    { method: "GET", path: "/clock:noon" },
    ...catalog.collisions.map((item) => item.witness),
  ];
  const actual = await expressWitness(raw, requests);
  const actualPairs = new Set();
  for (const result of actual) {
    const indexes = result.matched.split(",").filter(Boolean).map(Number);
    for (let left = 0; left < indexes.length; left += 1) {
      for (let right = left + 1; right < indexes.length; right += 1) {
        actualPairs.add(`${indexes[left]}:${indexes[right]}`);
      }
    }
  }
  const reportedPairs = new Set(catalog.collisions.map((item) => item.indexes.join(":")));
  assert.deepEqual(reportedPairs, actualPairs);

  const witnessResults = actual.slice(-catalog.collisions.length);
  catalog.collisions.forEach((collision, index) => {
    const matches = witnessResults[index].matched.split(",").map(Number);
    assert.equal(matches.includes(collision.indexes[0]), true);
    assert.equal(matches.includes(collision.indexes[1]), true);
  });
});

test("Express 5: unsupported path grammar and incompatible settings refuse instead of returning no-change", () => {
  const unsupported = runCli([
    "--before",
    join(FIXTURES_DIR, "failures", "unsupported-express-path.json"),
    "--after",
    join(EXPRESS_FIXTURES, "aliases-after.json"),
    "--out-dir",
    tmpOut(),
  ]);
  assert.equal(unsupported.status, 2);
  assert.equal(parseStdout(unsupported).code, "unsupported_express_path");

  const loose = loadCatalogDocument(frameworkCatalog([{ method: "GET", path: "/x" }]), "memory://loose");
  const strict = loadCatalogDocument(
    frameworkCatalog([{ method: "GET", path: "/x" }], { caseSensitive: false, strict: true }),
    "memory://strict",
  );
  assert.throws(
    () => diffRouteTables(loose, strict),
    (error) => error.code === "incompatible_catalogs" && error.refused === true,
  );
});
