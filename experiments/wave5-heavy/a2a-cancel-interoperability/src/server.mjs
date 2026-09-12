import express from "express";
import { createServer } from "node:net";
import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
} from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  UnauthenticatedUser,
} from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler } from "@a2a-js/sdk/server/express";

import { ChildProcessExecutor } from "./executor.mjs";

class BearerUser {
  constructor(name) {
    this._name = name;
  }
  get isAuthenticated() {
    return true;
  }
  get userName() {
    return this._name;
  }
}

export function bearerUserBuilder(req) {
  const header = String(req.headers.authorization || "");
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return Promise.resolve(new UnauthenticatedUser());
  return Promise.resolve(new BearerUser(match[1]));
}

export function makeCard(origin) {
  const url = origin.endsWith("/") ? origin : `${origin}/`;
  return {
    name: "Local A2A cancel fixture",
    description:
      "Local-only JSON-RPC fixture. Cancels a disposable child process. Not the production SameDayDesk discovery card.",
    supportedInterfaces: [
      {
        url,
        protocolBinding: "JSONRPC",
        tenant: "",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: "SameDayDesk local fixture",
      url: "https://samedaydesk.com",
    },
    version: "0.1.0-local-fixture",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text"],
    defaultOutputModes: ["text", "task-status"],
    skills: [
      {
        id: "local-cancellable-noop",
        name: "Local cancellable noop",
        description: "Runs a disposable child that writes heartbeats until SIGTERM or timeout.",
        tags: ["cancellation", "fixture"],
        examples: ["run a long local job"],
        inputModes: ["text"],
        outputModes: ["text", "task-status"],
        securityRequirements: [],
      },
    ],
    documentationUrl: "",
    signatures: [],
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export async function startFixtureServer({ userBuilder = bearerUserBuilder, workRoot } = {}) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const card = makeCard(origin);
  const taskStore = new InMemoryTaskStore();
  const executor = new ChildProcessExecutor({ workRoot });
  const requestHandler = new DefaultRequestHandler(card, taskStore, executor);
  const app = express();
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use(jsonRpcHandler({ requestHandler, userBuilder }));
  const httpServer = app.listen(port, "127.0.0.1");
  await new Promise((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
  });
  return {
    origin,
    port,
    card,
    executor,
    taskStore,
    requestHandler,
    async stop() {
      await executor.stopAll();
      await new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
