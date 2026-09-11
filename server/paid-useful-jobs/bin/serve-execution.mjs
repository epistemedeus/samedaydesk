#!/usr/bin/env node
/**
 * Local loopback execution HTTP. Not a production deploy.
 * D14 owns an independent consumer of this interface.
 */
import { EXECUTION_CONTRACT_VERSION } from "../lib/contract.mjs";
import { createExecutionServer, listenExecutionServer } from "../lib/http.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT ? Number(process.env.PORT) : 0;
const { server } = createExecutionServer();
const addr = await listenExecutionServer(server, { host, port });
process.stdout.write(
  `${JSON.stringify({ ok: true, origin: addr.origin, contract: EXECUTION_CONTRACT_VERSION })}\n`,
);
