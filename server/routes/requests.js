import { Router } from "express";
import { defaultTaskRequestStore, validateTaskRequest } from "../lib/task-requests.js";
import { notifyAdmin, sendTaskRequestReceived } from "../lib/notify.js";

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// POST /api/requests: one custom task. Answers 201 with the reference shown on screen; the
// requester gets the same reference by email and the desk is told.
export function createRequestsRouter({ store = defaultTaskRequestStore(), notify = { sendTaskRequestReceived, notifyAdmin } } = {}) {
  const router = Router();
  router.post("/", async (req, res) => {
    res.set({ "Cache-Control": "no-store" });
    const { request, error } = validateTaskRequest(req.body);
    if (error === "robot") return res.status(201).json({ received: true, reference: "SDD-REQ" });
    if (error) return res.status(400).json({ error: { field: error } });
    try {
      const row = await store.insert(request);
      const reference = `SDD-${row.id.slice(0, 8).toUpperCase()}`;
      await notify.sendTaskRequestReceived({ to: row.email, reference, task: row.task });
      await notify.notifyAdmin(
        `Task request ${reference}`,
        `<p>${escape(row.email)}${row.website ? ` · ${escape(row.website)}` : ""}</p><p>${escape(row.task).replace(/\n/g, "<br>")}</p>`,
      );
      return res.status(201).json({ received: true, reference });
    } catch (e) {
      console.error("[requests] store failed", e?.message);
      return res.status(503).json({ error: { field: "server" } });
    }
  });
  return router;
}

export default createRequestsRouter();
