// Disposable local listener for the runtime-maintenance regression.
// No uncaughtException handler: a trailing gzip frame must not kill the process.
import express from "express";
import { createSdsApp } from "../../app.js";

const mode = process.argv[2];
let app;
if (mode === "parser") {
  app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.post("/echo", (req, res) => {
    res.json({ ok: true, body: req.body });
  });
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
} else if (mode === "journey") {
  app = createSdsApp({ correspondence: { env: { NODE_ENV: "test" } } });
} else {
  process.stderr.write(`unknown mode ${mode || ""}\n`);
  process.exit(2);
}

const server = app.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`LISTEN ${address.port}\n`);
});
