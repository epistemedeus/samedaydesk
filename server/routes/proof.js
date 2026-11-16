// Same-origin proof figures for the homepage strip, read from the paid
// gateway's public health document. Cached for five minutes; on failure the
// page keeps its dated snapshot and says so. No figure is computed here that
// the gateway did not publish.
import { Router } from "express";

const SOURCE = "https://agents.samedaydesk.com/healthz";
const TTL_MS = 5 * 60 * 1000;
let cache = null;

export function projectProof(health, readAt = new Date().toISOString()) {
  const ledger = health?.settlementReconciliation?.ledger;
  if (!ledger || typeof ledger.reconciledSettlements !== "number") return null;
  return {
    schema: "samedaydesk.proof.v1",
    readAt,
    source: SOURCE,
    settlements: ledger.reconciledSettlements,
    internalSettlements: ledger.byClass?.internal?.settlements ?? 0,
    x402Routes: health?.paymentProtocols?.x402?.routeCount ?? null,
    lastReconciledAt: health?.settlementReconciliation?.lastRunAt ?? null,
    payTo: health?.payTo ?? null,
    network: health?.network ?? null,
  };
}

export const proofRouter = Router();
proofRouter.get("/", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  if (cache && Date.now() - cache.at < TTL_MS) return res.json(cache.body);
  try {
    const r = await fetch(SOURCE, { signal: AbortSignal.timeout(4000) });
    const body = projectProof(await r.json());
    if (!body) return res.status(502).json({ error: "proof_unavailable" });
    cache = { at: Date.now(), body };
    return res.json(body);
  } catch {
    return res.status(502).json({ error: "proof_unavailable" });
  }
});
