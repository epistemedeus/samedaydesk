import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
  createAuthenticatingFetchWithRetry,
} from "@a2a-js/sdk/client";
import { Role } from "@a2a-js/sdk";

export class CountingInterceptor {
  constructor() {
    this.calls = [];
  }
  async before(args) {
    this.calls.push({
      t: Date.now(),
      iso: new Date().toISOString(),
      phase: "before",
      method: args.input?.method,
    });
  }
  async after(args) {
    this.calls.push({
      t: Date.now(),
      iso: new Date().toISOString(),
      phase: "after",
      method: args.result?.method,
    });
  }
}

export function createAuthFetch(token) {
  return createAuthenticatingFetchWithRetry(globalThis.fetch, {
    headers: async () => (token ? { Authorization: `Bearer ${token}` } : {}),
    shouldRetryWithHeaders: async () => undefined,
  });
}

export async function createClient(origin, { token, interceptor } = {}) {
  const interceptors = interceptor ? [interceptor] : [];
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl: createAuthFetch(token) })],
      clientConfig: { interceptors },
    }),
  );
  return factory.createFromUrl(origin);
}

export function userMessage(text, extras = {}) {
  return {
    tenant: "",
    metadata: {},
    message: {
      messageId: crypto.randomUUID(),
      role: Role.ROLE_USER,
      parts: [
        {
          content: { $case: "text", value: text },
          metadata: undefined,
          filename: "",
          mediaType: "text/plain",
        },
      ],
      taskId: extras.taskId ?? "",
      contextId: extras.contextId ?? "",
      extensions: [],
      metadata: {},
      referenceTaskIds: [],
    },
    configuration: undefined,
  };
}

export function errorShape(err) {
  return {
    name: err?.name || null,
    reason: err?.reason || null,
    message: err instanceof Error ? err.message : String(err),
  };
}
