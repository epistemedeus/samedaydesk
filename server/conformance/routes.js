import express from "express";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBadgeSvg } from "./badge.js";
import { loadExistingProbeRecords, mcpSubjectKey, x402SubjectKey } from "./records.js";
import { renderIndexHtml, renderScorecardHtml } from "./render.js";
import { buildScorecard, listDirectory } from "./scorecard.js";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MCP_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const BLOCKED_HOST_SUFFIX = /(?:^|\.)(localhost|local|internal|in-addr\.arpa|ip6\.arpa)$/i;

export function isMcpSubject(org, repo) {
  return MCP_ID.test(org || "") && MCP_ID.test(repo || "");
}

export function isX402Host(host) {
  const value = String(host || "").toLowerCase();
  if (!HOST.test(value) || value.includes("/") || value.includes("..")) return false;
  if (isIP(value) || BLOCKED_HOST_SUFFIX.test(value)) return false;
  return true;
}

function loadCards(load) {
  try {
    const records = load();
    return Array.isArray(records) ? { ok: true, records } : { ok: false, records: [] };
  } catch {
    return { ok: false, records: [] };
  }
}

function recordsUnavailable(res, wantsJsonResponse) {
  res.setHeader("Cache-Control", "no-cache");
  const body = { error: "records unavailable", reason: "inaccessible_records" };
  if (wantsJsonResponse) return res.status(503).json(body);
  return res.status(503).type("json").json(body);
}

function wantsJson(req) {
  if (req.query.format === "json") return true;
  const accept = String(req.headers.accept || "");
  return accept.includes("application/json") && !accept.includes("text/html");
}

function sendScorecard(req, res, scorecard) {
  res.setHeader("Cache-Control", "no-cache");
  if (wantsJson(req)) return res.json(scorecard);
  return res.type("html").send(renderScorecardHtml(scorecard));
}

export function createConformanceRouter(options = {}) {
  const repoRoot = options.repoRoot || DEFAULT_ROOT;
  const load = options.loadRecords || (() => loadExistingProbeRecords(repoRoot));
  const now = options.now || (() => Date.now());
  const env = options.env || process.env;
  const staleAfterMs = options.staleAfterMs;
  const router = express.Router();

  function optionsNow() {
    return { now: typeof now === "function" ? now() : now, env, staleAfterMs };
  }

  router.get("/", (req, res) => {
    const loaded = loadCards(load);
    if (!loaded.ok) return recordsUnavailable(res, wantsJson(req));
    const directory = listDirectory(loaded.records, optionsNow());
    res.setHeader("Cache-Control", "no-cache");
    if (wantsJson(req)) return res.json(directory);
    return res.type("html").send(renderIndexHtml(directory));
  });

  router.get(["/mcp/:org/:repo/badge.svg", "/mcp/:org/:repo.svg"], (req, res) => {
    const { org, repo } = req.params;
    if (!isMcpSubject(org, repo)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const loaded = loadCards(load);
    if (!loaded.ok) return recordsUnavailable(res, true);
    const subjectKey = `${org}/${repo}`.toLowerCase();
    const records = loaded.records.filter((record) => record.kind === "mcp" && mcpSubjectKey(record.subject) === subjectKey);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    const scorecard = buildScorecard("mcp", records[0].subject, records, optionsNow());
    res.setHeader("Cache-Control", "no-cache");
    res.type("image/svg+xml").send(renderBadgeSvg(scorecard));
  });

  router.get(["/x402/:host/badge.svg", "/x402/:host.svg"], (req, res) => {
    const host = String(req.params.host || "").toLowerCase();
    if (!isX402Host(host)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const loaded = loadCards(load);
    if (!loaded.ok) return recordsUnavailable(res, true);
    const records = loaded.records.filter((record) => record.kind === "x402" && x402SubjectKey(record.subject) === host);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    const scorecard = buildScorecard("x402", records[0].subject, records, optionsNow());
    res.setHeader("Cache-Control", "no-cache");
    res.type("image/svg+xml").send(renderBadgeSvg(scorecard));
  });

  router.get("/mcp/:org/:repo", (req, res) => {
    const { org, repo } = req.params;
    if (!isMcpSubject(org, repo)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const loaded = loadCards(load);
    if (!loaded.ok) return recordsUnavailable(res, wantsJson(req));
    const subjectKey = `${org}/${repo}`.toLowerCase();
    const records = loaded.records.filter((record) => record.kind === "mcp" && mcpSubjectKey(record.subject) === subjectKey);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    sendScorecard(req, res, buildScorecard("mcp", records[0].subject, records, optionsNow()));
  });

  router.get("/x402/:host", (req, res) => {
    const host = String(req.params.host || "").toLowerCase();
    if (!isX402Host(host)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const loaded = loadCards(load);
    if (!loaded.ok) return recordsUnavailable(res, wantsJson(req));
    const records = loaded.records.filter((record) => record.kind === "x402" && x402SubjectKey(record.subject) === host);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    sendScorecard(req, res, buildScorecard("x402", records[0].subject, records, optionsNow()));
  });

  return router;
}
