import { MonitorError } from "./errors.mjs";

const RECEIVER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,64}$/;

export function assertReceiverId(value) {
  if (typeof value !== "string" || !RECEIVER_ID.test(value)) {
    throw new MonitorError("receiverId must be a short registry name, not a URL", { code: "bad_receiver" });
  }
  return value;
}

export function assertLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MonitorError("receiver baseUrl must be an absolute loopback URL", { code: "bad_receiver" });
  }
  if (url.protocol !== "http:") {
    throw new MonitorError("loopback receiver must use http", { code: "bad_receiver" });
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new MonitorError("delivery target must be a loopback receiver", { code: "bad_receiver" });
  }
  if (!url.port) {
    throw new MonitorError("loopback receiver needs an explicit port", { code: "bad_receiver" });
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new MonitorError("loopback receiver URL must be origin only", { code: "bad_receiver" });
  }
  return url.origin;
}

export function validateReceiverRegistry(receivers) {
  if (!receivers || typeof receivers !== "object" || Array.isArray(receivers)) {
    throw new MonitorError("receivers must be an object", { code: "bad_receiver" });
  }
  const registry = {};
  for (const [id, entry] of Object.entries(receivers)) {
    assertReceiverId(id);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new MonitorError(`receiver ${id} must be an object`, { code: "bad_receiver" });
    }
    if (entry.kind === "local-http") {
      registry[id] = { kind: "local-http", baseUrl: assertLoopbackBaseUrl(entry.baseUrl) };
      continue;
    }
    if (entry.kind === "injected") {
      if (typeof entry.send !== "function") {
        throw new MonitorError(`receiver ${id} send must be a function`, { code: "bad_receiver" });
      }
      registry[id] = {
        kind: "injected",
        send: entry.send,
        reconcile: typeof entry.reconcile === "function" ? entry.reconcile : null,
      };
      continue;
    }
    throw new MonitorError(`receiver ${id} kind is not registered`, { code: "bad_receiver" });
  }
  return registry;
}

export function receiversFromConfig(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new MonitorError("receivers file must be an object of receiver ids", { code: "bad_receiver" });
  }
  const source = document.receivers && typeof document.receivers === "object" ? document.receivers : document;
  const plain = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!entry || entry.kind !== "local-http") {
      throw new MonitorError("config receivers must be kind local-http", { code: "bad_receiver" });
    }
    plain[id] = { kind: "local-http", baseUrl: entry.baseUrl };
  }
  return validateReceiverRegistry(plain);
}
