import express from "express";
import { readBearer } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/auth.js";
import { hashToken } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { dispositionShape } from "./envelope.mjs";

const EVENT_WRITE = /^\/v1\/projects\/(prj_[\w-]{16})\/events$/;
const parseJson = express.json({ limit: 32 * 1024, type: ["application/json"] });

function sendError(res, status, code) {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error: { code, message: code } });
}

export function visitorEventProjectId(method, path) {
  if (method !== "POST") return null;
  return EVENT_WRITE.exec(path)?.[1] ?? null;
}

export function guardVisitorEvent(req, res, next, { store, forward }) {
  const projectId = visitorEventProjectId(req.method, req.path);
  if (!projectId) return forward();
  return parseJson(req, res, async (error) => {
    if (error) {
      if (error.type === "entity.too.large") return sendError(res, 413, "payload_too_large");
      return sendError(res, 400, "invalid_input");
    }
    try {
      if (req.body?.kind === "reply" && dispositionShape(req.body.text)) {
        const token = readBearer(req);
        const grant = token ? await store.findActiveGrantByTokenHash(hashToken(token)) : null;
        if (grant && grant.projectId !== projectId) return sendError(res, 404, "not_found");
        if (grant && grant.role !== "owner") return sendError(res, 403, "forbidden");
      }
      return forward();
    } catch {
      return sendError(res, 503, "unavailable");
    }
  });
}
