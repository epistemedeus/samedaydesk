import { get } from "node:http";

// SDS256 @ 622d82e5 probes with node:http, agent:false, a 16KiB cap, and a 5s timeout.
// Family is locked so connect/multiple cannot hide ECONNREFUSED on the other loopback.
export function probeLoopback(host, port, path, { timeoutMs = 5000, maxBytes = 16384, expectService = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const family = String(host).includes(":") ? 6 : 4;
    const request = get({ host, port, path, agent: false, family }, (response) => {
      let body = "";
      let overflow = false;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > maxBytes) {
          overflow = true;
          request.destroy();
        }
      });
      response.on("error", (error) => done({ ok: false, code: error.code || "ERR", status: response.statusCode ?? null }));
      response.on("end", () => {
        if (overflow) {
          done({ ok: false, code: "ETOOBIG", status: response.statusCode ?? null });
          return;
        }
        let service = null;
        try { service = JSON.parse(body).service ?? null; } catch { service = null; }
        const statusOk = response.statusCode === 200;
        const serviceOk = expectService == null || service === expectService;
        done({
          ok: statusOk && serviceOk,
          code: statusOk && serviceOk ? null : "HTTP",
          status: response.statusCode ?? null,
        });
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      done({ ok: false, code: "TIMEOUT", status: null });
    });
    request.on("error", (error) => done({ ok: false, code: error.code || "ERR", status: null }));
  });
}

export function snapshotAddress(address) {
  if (address == null) return null;
  if (typeof address === "string") return { pipe: address };
  return { address: address.address, family: address.family, port: address.port };
}
