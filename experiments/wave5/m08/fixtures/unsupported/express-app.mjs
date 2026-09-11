import express from "express";

const app = express();
app.get("/terms", (_req, res) => {
  res.send("Terms of Service");
});
app.get("/for-agents", (_req, res) => {
  res.send("Agents");
});
export default app;
