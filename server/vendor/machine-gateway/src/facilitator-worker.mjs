import { parentPort, workerData } from "node:worker_threads";
import { HTTPFacilitatorClient } from "@x402/core/http";

const nativeFetch = globalThis.fetch;
// This global belongs to this disposable worker only. No host-global patch.
globalThis.fetch = async (url, init) => {
  const response = await nativeFetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) });
  const reader = response.body?.getReader();
  const chunks = []; let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 16384) { await reader.cancel(); throw new Error("facilitator response limit"); }
        chunks.push(Buffer.from(next.value));
      }
    } finally { reader.releaseLock(); }
  }
  return new Response([204, 205, 304].includes(response.status) ? null : Buffer.concat(chunks), {
    status: response.status, headers: response.headers,
  });
};

try {
  if (!["verify", "settle"].includes(workerData.method)) throw new Error("invalid method");
  const client = new HTTPFacilitatorClient({ url: workerData.url,
    createAuthHeaders: async () => ({ [workerData.method]: workerData.authHeaders }) });
  const result = await client[workerData.method](workerData.prepared.payload, workerData.prepared.requirements);
  parentPort.postMessage({ result });
} catch { parentPort.postMessage({ error: "facilitator_unavailable" }); }
