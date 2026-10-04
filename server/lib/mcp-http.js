import express from "express";
import { MCP_BODY_LIMIT, rejectedMcpAdmission } from "./mcp-admission.js";
import { pulseMiddleware } from "./pulse.js";

export function mcpHeaders(req, res, next) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  });
  if (req.method === "POST" || Object.hasOwn(req.query || {}, "cs")) {
    res.set({ "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" });
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

// strict:false lets syntactically valid JSON primitives reach RPC validation;
// they are invalid requests, not malformed JSON. Other API parsers stay strict.
export const mcpJsonParser = express.json({ limit: MCP_BODY_LIMIT, strict: false });

export function mcpBodyError(error, req, res, next) {
  // Mounted directly after the MCP parser: also receive decompression/read
  // failures that lack body-parser's usual type property. Later route errors
  // cannot reach this earlier handler.
  const status = error.status >= 400 && error.status < 500 ? error.status : 400;
  const parseError = error.type === "entity.parse.failed";
  req.mcpAdmission = rejectedMcpAdmission(status, parseError ? -32700 : -32000, parseError ? "Parse error" : status === 413 ? `Request body exceeds ${MCP_BODY_LIMIT}` : "Invalid request body");
  // This error occurs before the normal observer. Receive its safe decision
  // explicitly; never emit body-parser's raw body/message to console or HTML.
  pulseMiddleware(req, res, () => {});
  return res.status(status).json(req.mcpAdmission.error);
}
