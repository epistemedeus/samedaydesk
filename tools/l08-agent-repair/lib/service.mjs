// Two owned endpoints. They speak only to the disposable target this process started.
import express from "express";
import http from "node:http";
import { buildDiagnosis, buildHandoff, FINDING_ID, validateMaintHandoff } from "./handoff.mjs";
import { changedFindings, observeTarget } from "./observe.mjs";

function denyForeignOrigin(body, origin) {
  if (body && typeof body.origin === "string" && body.origin !== origin) {
    return { error: "origin_not_owned" };
  }
  return null;
}

export function createRepairApp(target, context) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  const state = { before: null, diagnosis: null };

  app.post("/v1/diagnose", async (req, res) => {
    const denied = denyForeignOrigin(req.body, target.origin);
    if (denied) return res.status(400).json(denied);
    const observed = await observeTarget(target.origin);
    if (!observed.finding) return res.status(500).json({ error: "finding_absent" });
    state.before = observed.statuses;
    state.diagnosis = buildDiagnosis(observed);
    return res.json(state.diagnosis);
  });

  // Applies the disposable repair. The handoff file is written by the cold client.
  app.post("/v1/repair", (req, res) => {
    const denied = denyForeignOrigin(req.body, target.origin);
    if (denied) return res.status(400).json(denied);
    if (!state.before || !state.diagnosis) return res.status(409).json({ error: "diagnose_first" });
    if (state.diagnosis.finding?.status !== "fail") {
      return res.status(409).json({ error: "diagnosis_not_fail", findingId: FINDING_ID });
    }
    target.setMode("fixed");
    return res.json({ applied: true, mode: target.mode, findingId: FINDING_ID });
  });

  app.post("/v1/regress", async (req, res) => {
    const denied = denyForeignOrigin(req.body, target.origin);
    if (denied) return res.status(400).json(denied);
    if (!state.before || !state.diagnosis) return res.status(409).json({ error: "diagnose_first" });
    const observed = await observeTarget(target.origin);
    const changed = changedFindings(state.before, observed.statuses);
    const repaired = changed.length === 1
      && changed[0].id === FINDING_ID
      && changed[0].before === "fail"
      && changed[0].after === "pass";
    if (!repaired) {
      return res.status(409).json({
        error: changed.length === 0 ? "finding_unchanged" : "unexpected_finding_changes",
        findingId: FINDING_ID,
        before: state.before[FINDING_ID] ?? "absent",
        after: observed.finding?.status ?? "absent",
        changed,
      });
    }
    const handoff = buildHandoff({
      diagnosis: state.diagnosis,
      afterExchange: observed.exchange,
      changed,
      protocolEdge: context.protocolEdge,
      sellerRepair: context.sellerRepair,
      journey: context.journey,
    });
    const verdict = validateMaintHandoff(handoff);
    if (!verdict.ok) return res.status(500).json({ error: "handoff_rejected", reason: verdict.error });
    return res.json(handoff);
  });

  return app;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

export async function startRepairService(target, context) {
  const app = createRepairApp(target, context);
  const server = http.createServer(app);
  const port = await listen(server);
  return {
    origin: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
