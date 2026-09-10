import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CONSUMER_REPEAT_ARCHIVE,
  CONSUMER_REPEAT_ARCHIVE_BYTES,
  CONSUMER_REPEAT_ARCHIVE_SHA256,
  CONSUMER_REPEAT_CANONICAL,
  CONSUMER_REPEAT_COLD_START,
  CONSUMER_REPEAT_DISCOVERY,
  CONSUMER_REPEAT_PACKAGE_ID,
  CONSUMER_REPEAT_PATH,
  CONSUMER_REPEAT_REVIEWED_SOURCE,
  CONSUMER_REPEAT_SHELL,
  CONSUMER_REPEAT_SOURCE_COMMIT,
  CONSUMER_REPEAT_SOURCE_REPO,
} from "../../../client/src/data/machineEntry.mjs";
import { SPA_HISTORY_ROUTES } from "../../../server/lib/spa-fallback.js";
import { SPA_ROUTE_SHELLS } from "../../../server/lib/spa-route-shells.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const ARCHIVE = join(ROOT, "client/public/kit/s178-consumer-repeat-kit.tgz");
const RECEIPT = join(ROOT, "client/public/kit/s178-consumer-repeat-archive.sha256.json");
const DISCOVERY = join(ROOT, "client/public/discovery/consumer-repeat.json");
const KIT_JSON = join(ROOT, "client/src/data/consumerRepeatKit.json");
const PAGE = join(ROOT, "client/src/pages/ConsumerRepeat.tsx");
const APP = join(ROOT, "client/src/App.tsx");
const LLMS = join(ROOT, "client/public/llms.txt");
const SITEMAP = join(ROOT, "client/public/sitemap.xml");

const EXPECTED_SHA = "04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d";
const EXPECTED_BYTES = 718948;
const SOURCE_COMMIT = "e7a53c48a2db5393e1e340e5d43143547f79dbd7";
const REVIEWED = "361460288e96d43da2f215e158fad96745507fde";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("committed public archive bytes and sha256 are unchanged", () => {
  assert.equal(statSync(ARCHIVE).size, EXPECTED_BYTES);
  assert.equal(sha256File(ARCHIVE), EXPECTED_SHA);
});

test("page, discovery, receipt, and machineEntry share archive pins", () => {
  const discovery = JSON.parse(readFileSync(DISCOVERY, "utf8"));
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  const kit = JSON.parse(readFileSync(KIT_JSON, "utf8"));

  for (const obj of [discovery.archive, receipt, kit]) {
    assert.equal(Number(obj.bytes), EXPECTED_BYTES);
    assert.equal(obj.sha256, EXPECTED_SHA);
  }
  assert.equal(discovery.archive.path, "/kit/s178-consumer-repeat-kit.tgz");
  assert.equal(discovery.archive.url, "https://samedaydesk.com/kit/s178-consumer-repeat-kit.tgz");
  assert.equal(kit.archive, "/kit/s178-consumer-repeat-kit.tgz");
  assert.equal(receipt.archive, "s178-consumer-repeat-kit.tgz");

  assert.equal(CONSUMER_REPEAT_ARCHIVE, kit.archive);
  assert.equal(CONSUMER_REPEAT_ARCHIVE_SHA256, EXPECTED_SHA);
  assert.equal(CONSUMER_REPEAT_ARCHIVE_BYTES, EXPECTED_BYTES);
  assert.equal(CONSUMER_REPEAT_DISCOVERY, "/discovery/consumer-repeat.json");
  assert.equal(CONSUMER_REPEAT_PACKAGE_ID, "s178-consumer-repeat-kit");
  assert.equal(CONSUMER_REPEAT_SOURCE_REPO, "epistemedeus/x402-url-extractor");
  assert.equal(CONSUMER_REPEAT_SOURCE_COMMIT, SOURCE_COMMIT);
  assert.equal(CONSUMER_REPEAT_REVIEWED_SOURCE, REVIEWED);
  assert.equal(discovery.pins.sourceCommit, SOURCE_COMMIT);
  assert.equal(discovery.pins.reviewedSource, REVIEWED);
  assert.equal(receipt.sourceCommit, SOURCE_COMMIT);
  assert.equal(receipt.reviewedSource, REVIEWED);
  assert.equal(kit.sourceCommit, SOURCE_COMMIT);
  assert.equal(kit.reviewedSource, REVIEWED);
  assert.equal(discovery.packageId, receipt.packageId);
  assert.equal(discovery.invokesPricedExecution, false);
  assert.equal(receipt.invokesPricedExecution, false);
  assert.equal(kit.invokesPricedExecution, false);
});

test("route, shell, App, llms, sitemap, and download path are wired", () => {
  assert.equal(CONSUMER_REPEAT_PATH, "/for-agents/consumer-repeat");
  assert.equal(CONSUMER_REPEAT_CANONICAL, "https://samedaydesk.com/for-agents/consumer-repeat");
  assert.equal(CONSUMER_REPEAT_SHELL.path, CONSUMER_REPEAT_PATH);
  assert.equal(SPA_HISTORY_ROUTES.includes(CONSUMER_REPEAT_PATH), true);
  assert.equal(
    SPA_ROUTE_SHELLS.some((route) => route.path === CONSUMER_REPEAT_PATH),
    true,
  );
  const app = readFileSync(APP, "utf8");
  assert.match(app, /path="\/for-agents\/consumer-repeat" element=\{<ConsumerRepeat \/>\}/);
  const llms = readFileSync(LLMS, "utf8");
  assert.match(llms, /https:\/\/samedaydesk\.com\/for-agents\/consumer-repeat/);
  assert.match(llms, /https:\/\/samedaydesk\.com\/discovery\/consumer-repeat\.json/);
  const sitemap = readFileSync(SITEMAP, "utf8");
  assert.match(sitemap, /https:\/\/samedaydesk\.com\/for-agents\/consumer-repeat/);
  {
    const discoveryDoc = JSON.parse(readFileSync(DISCOVERY, "utf8"));
    const servedCold =
      typeof discoveryDoc.coldStart === "string"
        ? discoveryDoc.coldStart
        : discoveryDoc.coldStart.join("\n");
    assert.equal(servedCold, CONSUMER_REPEAT_COLD_START);
    assert.equal(servedCold.includes('\\"'), false);
    assert.match(servedCold, /mktemp -d/);
    assert.match(servedCold, /--max-time 60/);
    assert.equal(CONSUMER_REPEAT_SHELL.crawlerHtml.includes(CONSUMER_REPEAT_COLD_START), true);
  }
  assert.match(CONSUMER_REPEAT_COLD_START, /s178-consumer-repeat-kit\.tgz/);
  assert.match(CONSUMER_REPEAT_COLD_START, new RegExp(EXPECTED_SHA));
  assert.match(CONSUMER_REPEAT_COLD_START, new RegExp(String(EXPECTED_BYTES)));
  assert.match(CONSUMER_REPEAT_SHELL.crawlerHtml, /Download archive/);
  assert.match(CONSUMER_REPEAT_SHELL.crawlerHtml, /Labeled samples/);
});

test("buyer page copy avoids internal task names and prose em dashes", () => {
  const page = readFileSync(PAGE, "utf8");
  assert.equal(page.includes("\u2014"), false);
  assert.doesNotMatch(page, /\bS153\b/);
  assert.doesNotMatch(page, /\bS220\b/);
  assert.doesNotMatch(page, /\bS227\b/);
  assert.match(page, /labeled samples/i);
  assert.match(page, /operator clock/);
  assert.match(page, /Download archive/);
  const crawler = CONSUMER_REPEAT_SHELL.crawlerHtml;
  assert.equal(crawler.includes("\u2014"), false);
  assert.doesNotMatch(crawler, /\bS153\b/);
  assert.doesNotMatch(crawler, /\bS220\b/);
  assert.doesNotMatch(crawler, /\bS227\b/);
});
