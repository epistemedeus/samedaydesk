import express, { Router } from "express";
import {
  DEFAULT_MAX_BYTES,
  projectDeclaredEvidence,
  safeCode,
} from "../lib/funnel-evidence/project-evidence.mjs";

const router = Router();

export const funnelEvidenceParser = express.json({ limit: DEFAULT_MAX_BYTES });

export function funnelEvidenceBodyError(error, _req, res, next) {
  if (res.headersSent) return next(error);
  const parseError = error?.type === "entity.parse.failed";
  const oversize = error?.type === "entity.too.large" || error?.status === 413;
  const code = parseError ? "malformed_json" : oversize ? "oversize" : "invalid_body";
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  return res.status(oversize ? 413 : 400).json({ error: { code } });
}

function statusFor(code) {
  return code === "oversize" ? 413 : 400;
}

router.post("/", (req, res) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  try {
    return res.status(200).json(projectDeclaredEvidence(req.body));
  } catch (error) {
    const code = safeCode(error);
    return res.status(statusFor(code)).json({ error: { code } });
  }
});

export default router;
