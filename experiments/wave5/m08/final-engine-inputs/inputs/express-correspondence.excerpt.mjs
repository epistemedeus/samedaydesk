// Compact excerpt of D01 vendor/neomorphic-correspondence/dist/app.js at
// 46f2b7f55a7fb780333073a5197b64b8fde64a33. Express source, not an SDS catalog.
// The shipped route-table-diff CLI must not invent {path, canonical, title} from this.

export function createApp(app) {
  app.get("/healthz", async (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.post("/v1/projects", async (_req, res) => {
    res.status(201).json({ project: {} });
  });
  app.get("/v1/projects/:projectId", async (_req, res) => {
    res.status(200).json({ project: {} });
  });
  app.get("/v1/projects/:projectId/events", async (_req, res) => {
    res.status(200).json({ events: [] });
  });
  app.post("/v1/projects/:projectId/events", async (_req, res) => {
    res.status(201).json({ event: {} });
  });
}
