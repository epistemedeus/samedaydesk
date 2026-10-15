import { Worker } from "node:worker_threads";
import { abortable } from "./util.mjs";
import { GatewayError } from "./errors.mjs";

// Reuse the enrolled SDK client's URL and operation-specific authentication.
// Isolate SDK transport defaults from all unrelated host requests.
export async function invokeFacilitator(client, method, prepared, signal, { allowLoopback = false } = {}) {
  signal.throwIfAborted();
  const url = new URL(client.url);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" ||
    (allowLoopback && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))) throw new GatewayError("facilitator_configuration", 503);
  const auth = await abortable(() => client.createAuthHeaders(method), signal);
  if (!auth?.headers || Object.entries(auth.headers).some(([key, value]) => !/^[a-z0-9-]{1,128}$/i.test(key) || typeof value !== "string" || value.length > 4096 || /[\r\n]/.test(value)) || Object.keys(auth.headers).length > 16) throw new GatewayError("facilitator_configuration", 503);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./facilitator-worker.mjs", import.meta.url), {
      workerData: { url: client.url, method, authHeaders: auth.headers, prepared },
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
    });
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      void worker.terminate().then(() => error ? reject(error) : resolve(result), () => reject(new GatewayError("facilitator_unavailable", 502)));
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    worker.once("message", message => finish(message.error ? new GatewayError("facilitator_unavailable", 502) : null, message.result));
    worker.once("error", () => finish(new GatewayError("facilitator_unavailable", 502)));
    worker.once("exit", () => { if (!finished) finish(new GatewayError("facilitator_unavailable", 502)); });
  });
}
