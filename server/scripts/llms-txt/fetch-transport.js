// Test-only transport: routes bounded-fetch through the (stubbed) global fetch with the
// same contract as probe.js rawExchange (manual redirects, byte cap, signal, disposal).
import { setTransportForTests } from "../../lib/agent-readiness/bounded-fetch.js";

export const disposed = [];
export function installFetchTransport() {
  setTransportForTests(async (url, o) => {
    try {
      const r = await globalThis.fetch(url.toString(), { redirect: "manual", headers: o.headers, signal: o.signal });
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      if (r.status >= 300) {
        if (r.body) await r.body.cancel();
        disposed.push(url.toString());
        return { status: r.status, headers, body: "", disposed: true };
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const truncated = buf.length >= o.maxBytes;
      return { status: r.status, headers, body: buf.subarray(0, o.maxBytes).toString("utf8"), ...(truncated ? { truncated: true } : {}) };
    } catch {
      return { status: 0, headers: {}, body: "", error: o.signal?.aborted ? "aborted" : "connection" };
    }
  });
}
export function uninstallFetchTransport() { setTransportForTests(null); }
