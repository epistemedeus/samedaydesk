/**
 * Local dual-origin prove mount for S54 observatory.
 * Named sources only. Not a URL proxy.
 */
import express from "express";
import { createObservatoryRouter } from "../server/routes/observatory.js";

const port = Number(process.env.PORT || 3541);
const host = process.env.HOST || "127.0.0.1";

const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_req, res) => res.json({ ok: true, mount: "/api/observatory" }));
app.use("/api/observatory", createObservatoryRouter());
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(port, host, () => {
  console.log(`sds-observatory ${host}:${port}`);
});
