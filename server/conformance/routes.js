import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBadgeSvg } from "./badge.js";
import { loadExistingProbeRecords, mcpSubjectKey, x402SubjectKey } from "./records.js";
import { renderIndexHtml, renderScorecardHtml } from "./render.js";
import { buildScorecard, listDirectory } from "./scorecard.js";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MCP_ID = /^[A-Za-z0-9_.-]+$/;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isMcpSubject(org, repo) {
  return MCP_ID.test(org || "") && MCP_ID.test(repo || "") && org !== ".." && repo !== "..";
}

export function isX402Host(host) {
  return HOST.test(host || "") && !String(host).includes("/") && !String(host).includes("..");
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

  function cards() {
    return load();
  }

  function optionsNow() {
    return { now: typeof now === "function" ? now() : now, env, staleAfterMs };
  }

  router.get("/", (req, res) => {
    const directory = listDirectory(cards(), optionsNow());
    res.setHeader("Cache-Control", "no-cache");
    if (wantsJson(req)) return res.json(directory);
    return res.type("html").send(renderIndexHtml(directory));
  });

  router.get(["/mcp/:org/:repo/badge.svg", "/mcp/:org/:repo.svg"], (req, res) => {
    const { org, repo } = req.params;
    if (!isMcpSubject(org, repo)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const subjectKey = `${org}/${repo}`.toLowerCase();
    const records = cards().filter((record) => record.kind === "mcp" && mcpSubjectKey(record.subject) === subjectKey);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    const scorecard = buildScorecard("mcp", records[0].subject, records, optionsNow());
    res.setHeader("Cache-Control", "no-cache");
    res.type("image/svg+xml").send(renderBadgeSvg(scorecard));
  });

  router.get(["/x402/:host/badge.svg", "/x402/:host.svg"], (req, res) => {
    const host = String(req.params.host || "").toLowerCase();
    if (!isX402Host(host)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const records = cards().filter((record) => record.kind === "x402" && x402SubjectKey(record.subject) === host);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    const scorecard = buildScorecard("x402", records[0].subject, records, optionsNow());
    res.setHeader("Cache-Control", "no-cache");
    res.type("image/svg+xml").send(renderBadgeSvg(scorecard));
  });

  router.get("/mcp/:org/:repo", (req, res) => {
    const { org, repo } = req.params;
    if (!isMcpSubject(org, repo)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const subjectKey = `${org}/${repo}`.toLowerCase();
    const records = cards().filter((record) => record.kind === "mcp" && mcpSubjectKey(record.subject) === subjectKey);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    sendScorecard(req, res, buildScorecard("mcp", records[0].subject, records, optionsNow()));
  });

  router.get("/x402/:host", (req, res) => {
    const host = String(req.params.host || "").toLowerCase();
    if (!isX402Host(host)) return res.status(404).json({ error: "Not found", reason: "invalid_subject" });
    const records = cards().filter((record) => record.kind === "x402" && x402SubjectKey(record.subject) === host);
    if (!records.length) return res.status(404).json({ error: "Not found", reason: "no_public_check" });
    sendScorecard(req, res, buildScorecard("x402", records[0].subject, records, optionsNow()));
  });

  return router;
}
