import express from "express";
import { readBearer } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/auth.js";
import { tokensEqual } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { receiveOriginalTasks, writeOriginalTaskDisposition } from "./collect.mjs";
import { OriginalTaskError } from "./envelope.mjs";

const COLLECTION = "/v1/operator/original-tasks";
const DISPOSITION = /^\/v1\/operator\/original-tasks\/(prj_[\w-]{16})\/disposition$/;

export function isOriginalTaskOperatorPath(path) {
  return path === COLLECTION || DISPOSITION.test(path);
}

function sendError(res, status, code) {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error: { code, message: code } });
}

const parseJson = express.json({ limit: 32 * 1024, type: ["application/json"] });

export function handleOriginalTaskOperator(req, res, { store, adminToken }) {
  const presented = readBearer(req);
  if (!presented || !tokensEqual(presented, adminToken)) return sendError(res, 401, "unauthorized");
  const finish = async () => {
    try {
      if (req.path === COLLECTION) {
        if (req.method !== "GET") return sendError(res, 405, "method_not_allowed");
        const after = typeof req.query?.after === "string" ? req.query.after : null;
        const body = await receiveOriginalTasks(store, { cursor: after });
        res.set("Cache-Control", "no-store");
        return res.status(200).json(body);
      }
      const match = DISPOSITION.exec(req.path);
      if (!match) return sendError(res, 404, "not_found");
      if (req.method !== "POST") return sendError(res, 405, "method_not_allowed");
      const written = await writeOriginalTaskDisposition(store, {
        projectId: match[1],
        body: req.body,
        idempotencyKey: req.header("idempotency-key"),
      });
      res.set("Cache-Control", "no-store");
      return res.status(written.replayed ? 200 : 201).json(written);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      const code = typeof error?.code === "string" ? error.code : "unavailable";
      if (!(error instanceof OriginalTaskError) && (!error?.status || error.status >= 500)) {
        console.error("original_task_operator_failed", { code: error?.code || error?.name || "unknown" });
      }
      return sendError(res, status, code);
    }
  };
  if (req.method !== "POST") return finish();
  return parseJson(req, res, (error) => {
    if (!error) return finish();
    if (error.type === "entity.too.large") return sendError(res, 413, "payload_too_large");
    return sendError(res, 400, "invalid_input");
  });
}
