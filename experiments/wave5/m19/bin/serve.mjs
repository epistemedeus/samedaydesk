#!/usr/bin/env node
import { listenDistributionServer } from "../lib/http.mjs";

const port = Number(process.env.PORT || 0);
const { server, url } = await listenDistributionServer(port);
process.stdout.write(`listening ${url}\n`);
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
