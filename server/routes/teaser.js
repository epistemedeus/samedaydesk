import { Router } from "express";

// Free-teaser intake (the trust wedge). Implemented in a later phase: capture the
// prospect's target role + current resume snippet, notify the operator, queue delivery.
const router = Router();

router.post("/", (_req, res) => res.status(501).json({ error: "Not implemented yet" }));

export default router;
