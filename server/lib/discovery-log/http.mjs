// Hosted discovery-log export. One route in the existing SDS process.
// DISCOVERY_LOG_DIR and CORRESPONDENCE_ADMIN_TOKEN come from the server environment.
// A request cannot name a directory, a token is never written back, and nothing is listed.
import express from "express";
import { readBearer } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/auth.js";
import { tokensEqual } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { readDiscoveryPage } from "./export-log.mjs";
import { retainDiscoveryLogs } from "./retain.mjs";
import { validDate } from "./bounds.mjs";

export const EXPORT_PATH = "/api/discovery-log/v1/export";
export const RETAIN_PATH = "/api/discovery-log/v1/retain";
const RETAIN_DAYS = 30;

const STATUS = new Map([
  ["discovery_export_unauthenticated", 401],
  ["discovery_export_unconfigured", 503],
  ["discovery_export_dir_refused", 400],
  ["discovery_export_traversal", 400],
  ["discovery_export_cursor_refused", 400],
  ["discovery_export_missing", 404],
  ["discovery_export_unbounded", 413],
  ["discovery_export_token_refused", 422],
  ["discovery_export_record_refused", 422],
  ["discovery_export_method", 405],
  ["discovery_retain_not_received", 400],
  ["discovery_retain_days_required", 400],
  ["discovery_retain_receipt_required", 400],
  ["discovery_retain_partial", 400],
  ["discovery_retain_asof_refused", 400],
  ["discovery_prepare_mode_refused", 409],
  ["discovery_prepare_parent_missing", 409],
]);

function send(res, status, body) {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Robots-Tag", "noindex");
  res.status(status).json(body);
}

function fail(res, error) {
  const code = STATUS.has(error?.message) ? error.message : "discovery_export_refused";
  if (code === "discovery_export_unauthenticated") res.set("WWW-Authenticate", "Bearer");
  send(res, STATUS.get(code) || 400, { error: code });
}

function configured(env) {
  const dir = env.DISCOVERY_LOG_DIR;
  const token = typeof env.CORRESPONDENCE_ADMIN_TOKEN === "string" ? env.CORRESPONDENCE_ADMIN_TOKEN.trim() : "";
  if (typeof dir !== "string" || dir.length === 0 || token.length < 24) throw new Error("discovery_export_unconfigured");
  return { dir, token };
}

function authorize(req, token) {
  const presented = readBearer(req);
  if (typeof presented !== "string" || presented.length === 0 || !tokensEqual(presented, token)) {
    throw new Error("discovery_export_unauthenticated");
  }
}

function single(value) {
  if (Array.isArray(value)) throw new Error("discovery_export_dir_refused");
  return value;
}

function refuseCallerDir(req) {
  const query = req.query || {};
  for (const key of Object.keys(query)) {
    if (key !== "date" && key !== "cursor") throw new Error("discovery_export_dir_refused");
  }
  for (const key of Object.keys(req.headers || {})) {
    if (key.includes("discovery-log-dir") || key === "x-discovery-dir") throw new Error("discovery_export_dir_refused");
  }
}

export function mountDiscoveryLogExport(app, options = {}) {
  const env = options.env || process.env;
  const router = express.Router();

  router.get("/export", (req, res) => {
    try {
      const { dir, token } = configured(env);
      authorize(req, token);
      refuseCallerDir(req);
      const date = single(req.query?.date);
      const cursor = single(req.query?.cursor);
      if (cursor !== undefined && typeof cursor !== "string") throw new Error("discovery_export_cursor_refused");
      const page = readDiscoveryPage({ dir, date, cursor: cursor || null });
      send(res, 200, {
        schema: "samedaydesk.discovery-log.export.v1",
        date,
        lines: page.lines,
        nextCursor: page.nextCursor,
        complete: page.complete,
        offset: page.offset,
        ...(page.complete ? { watermark: page.watermark, bytes: page.bytes } : {}),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/retain", (req, res) => {
    try {
      const { dir, token } = configured(env);
      authorize(req, token);
      refuseCallerDir(req);
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("discovery_retain_not_received");
      for (const key of Object.keys(body)) {
        if (key !== "retainDays" && key !== "asOf" && key !== "received" && key !== "receipts") throw new Error("discovery_export_dir_refused");
      }
      if (body.received !== true) throw new Error("discovery_retain_not_received");
      if (body.retainDays !== RETAIN_DAYS) throw new Error("discovery_retain_days_required");
      if (body.asOf !== undefined && !validDate(body.asOf)) throw new Error("discovery_retain_days_required");
      const receipt = retainDiscoveryLogs({
        dir, retainDays: RETAIN_DAYS, asOf: body.asOf, receipts: body.receipts, preauthorized: true,
      });
      send(res, 200, receipt);
    } catch (error) {
      fail(res, error);
    }
  });

  router.all("/export", (_req, res) => fail(res, new Error("discovery_export_method")));
  router.all("/retain", (_req, res) => fail(res, new Error("discovery_export_method")));
  app.use("/api/discovery-log/v1", router);
}
