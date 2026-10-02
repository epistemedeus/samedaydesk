import express from "express";
import { createSdsApp } from "../../../server/app.js";
import { UsefulJourneyService } from "../lib/service.mjs";
import { createJourneyRouter } from "../lib/router.mjs";
import { PREFIX } from "../lib/contracts.mjs";

const service = new UsefulJourneyService(process.env.USEFUL_TEST_DATABASE_URL);
await service.checkReady();
const app = express();
app.use(PREFIX, createJourneyRouter({ service }));
app.use(createSdsApp());
const server = app.listen(Number(process.env.USEFUL_TEST_PORT || 0), "127.0.0.1", () => {
  process.send?.({ origin: `http://127.0.0.1:${server.address().port}` });
});
process.on("message", async message => {
  if (message !== "stop") return;
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await service.close();
  await app.get("s51Correspondence")?.close();
  process.exit(0);
});
