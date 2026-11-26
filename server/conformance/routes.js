import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBadgeSvg } from "./badge.js";
import { loadExistingProbeRecords, mcpSubjectKey, x402SubjectKey } from "./records.js";
import { renderIndexHtml, renderScorecardHtml } from "./render.js";
import { buildScorecard, listDirectory } from "./scorecard.js";
import { isMcpSubject, isX402Host } from "./subjects.js";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export { isMcpSubject, isX402Host };

function loadCards(load) {
  try {
    const records = load();
    return Array.isArray(records) ? { ok: true, records } : { ok: false, records: [] };
  } catch {
    return { ok: false, records: [] };
  }
}

function setDirectoryHeaders(res, kind) {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (kind === "html") {
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'");
  } else {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
  }
}

function recordsUnavailable(res, wantsJsonResponse) {
  setDirectoryHeaders(res, "json");
  const body = { error: "records unavailable", reason: "inaccessible_records" };
  return res.status(503).type("json").json(body);
}

function wantsJson(req) {
  if (req.query.format === "json") return true;
  const accept = String(req.headers.accept || "");
  return accept.includes("application/json") && !accept.includes("text/html");
}

function sendScorecard(req, res, scorecard) {
  if (wantsJson(req)) {
    setDirectoryHeaders(res, "json");
    return res.json(scorecard);
  }
  setDirectoryHeaders(res, "html");
  return res.type("html").send(renderScorecardHtml(scorecard));
}

function sendBadge(res, scorecard) {
  setDirectoryHeaders(res, "svg");
  return res.type("image/svg+xml").send(renderBadgeSvg(scorecard));
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
    if (wantsJson(req)) {
      setDirectoryHeaders(res, "json");
      return res.json(directory);
    }
    setDirectoryHeaders(res, "html");
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
    return sendBadge(res, buildScorecard("mcp", records[0].subject, records, optionsNow()));
  });

  router.get(["/x402/:host/badge.svg", "/x402/:host.svg"], (req, res) => {
    const host = String(req.params.host || "").toLowerCase();
    if (!isX402Host(host)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const loaded = loadCards(load);
    if (!loaded.ok) return recordsUnavailable(res, true);
    const records = loaded.records.filter((record) => record.kind === "x402" && x402SubjectKey(record.subject) === host);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    return sendBadge(res, buildScorecard("x402", records[0].subject, records, optionsNow()));
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

  router.use((req, res) => {
    setDirectoryHeaders(res, "json");
    return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
  });

  return router;
}
