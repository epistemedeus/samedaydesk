#!/usr/bin/env node
import { createOfferServer, listenOfferServer } from "../lib/http.mjs";

const host = process.env.M12_HOST || "127.0.0.1";
const port = process.env.M12_PORT ? Number(process.env.M12_PORT) : 0;
const { server, offer } = await createOfferServer();
const addr = await listenOfferServer(server, { host, port });
process.stdout.write(
  `${JSON.stringify({ ok: true, schema: offer.schema, offerId: offer.offerId, url: `http://${addr.host}:${addr.port}/offer` }, null, 2)}\n`,
);
