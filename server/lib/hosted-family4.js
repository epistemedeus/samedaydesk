import { createServer, get } from "node:http";
import net from "node:net";
import { isIpv4TcpAddress } from "./hosted-listen.js";

const PROBE_HOST = "127.0.0.1";
const BODY_CAP = 16384;

function fail(code) {
  return { ok: false, code, status: null, service: null };
}

export function startupGate(surface) {
  if (surface?.capable === true && surface.host === PROBE_HOST && surface.family === 4) {
    return { runHealth: true, cause: "capable", ipv6DualStackExplains: false };
  }
  // ECONNREFUSED on a finished IPv4 bind is the live Hostinger class. Health
  // still runs. Skipping it would stamp a refused loopback as a pass.
  if (surface?.stage === "connect" && surface.code === "ECONNREFUSED" && surface.host === PROBE_HOST && surface.family === 4 && isIpv4TcpAddress(surface.address)) {
    return { runHealth: true, cause: "econnrefused", ipv6DualStackExplains: false };
  }
  // A finished IPv4 bind whose family-4 connect failed for another reason
  // (for example ENETUNREACH) is an incapable surface. A bind error still
  // has to run the real listen assertion.
  if (surface?.stage === "connect" && surface.host === PROBE_HOST && surface.family === 4 && isIpv4TcpAddress(surface.address)) {
    return { runHealth: false, cause: "surface-incapable", ipv6DualStackExplains: false };
  }
  return { runHealth: true, cause: "probe-inconclusive", ipv6DualStackExplains: false };
}

function childHasExited(childExit) {
  return childExit != null && (childExit.code !== null || childExit.signal != null);
}

export function classifyHostedStartup(evidence) {
  const probed = evidence?.probed;
  if (!probed || probed.host !== PROBE_HOST || probed.family !== 4) {
    return { cause: "not-family-4", accepted: false, ipv6DualStackExplains: false };
  }
  const exited = childHasExited(evidence.childExit);
  const parentOk = evidence.parent?.ok === true;
  const childAccepted = evidence.sameChild?.ok === true;
  if (!parentOk && exited) {
    return { cause: "child-exit", accepted: false, ipv6DualStackExplains: false };
  }
  if (!childAccepted && !parentOk) {
    return { cause: "never-accepted", accepted: false, ipv6DualStackExplains: false };
  }
  if (childAccepted && !parentOk) {
    return { cause: "probe-race", accepted: false, ipv6DualStackExplains: false };
  }
  if (childAccepted && parentOk && !exited) {
    return { cause: "reachable", accepted: true, ipv6DualStackExplains: false };
  }
  return { cause: "unclassified", accepted: false, ipv6DualStackExplains: false };
}

// A report that marks success while 127.0.0.1 refused, or the child has
// already exited, is a false green. Honest refusals are left alone.
export function rejectFalseGreen(report) {
  const refused = report?.parent?.code === "ECONNREFUSED";
  const exited = childHasExited(report?.childExit);
  const claimsSuccess = report?.accepted === true || report?.cause === "reachable";
  if (claimsSuccess && (refused || exited)) {
    return { ok: false, cause: "false-green" };
  }
  return { ok: true, cause: report?.cause ?? "ok" };
}

function classifyUnderlying(evidence) {
  const probed = evidence?.probed;
  if (!probed || probed.host !== PROBE_HOST || probed.family !== 4) {
    return { cause: "not-family-4", accepted: false, ipv6DualStackExplains: false };
  }
  if (!isIpv4TcpAddress(evidence.bound)) {
    return { cause: "address-null", accepted: false, ipv6DualStackExplains: false };
  }
  const parentOk = evidence.parent?.ok === true;
  const exited = evidence.childExit != null && (
    evidence.childExit.code !== null || evidence.childExit.signal != null
  );
  if (!parentOk && exited) {
    return { cause: "child-exit", accepted: false, ipv6DualStackExplains: false };
  }
  if (evidence.surfaceCapable === false) {
    return {
      cause: "surface-incapable",
      accepted: false,
      ipv6DualStackExplains: false,
      parentIsolated: evidence.sameNetns === false,
    };
  }
  if (evidence.sameNetns === false && !parentOk) {
    return { cause: "cross-process", accepted: false, ipv6DualStackExplains: false };
  }
  const childOk = evidence.sameChild?.ok === true;
  if (childOk && !parentOk) {
    return { cause: "cross-process", accepted: false, ipv6DualStackExplains: false };
  }
  if (!childOk && !parentOk) {
    return { cause: "loopback-refused", accepted: false, ipv6DualStackExplains: false };
  }
  if (childOk && parentOk && !exited) {
    return { cause: "reachable", accepted: true, ipv6DualStackExplains: false };
  }
  return { cause: "unclassified", accepted: false, ipv6DualStackExplains: false };
}

export function classifyFamily4(evidence) {
  const underlying = classifyUnderlying(evidence);
  if (evidence?.claimedCause === "ipv6-dual-stack") {
    return {
      cause: "rejected-ipv6-claim",
      accepted: false,
      ipv6DualStackExplains: false,
      underlying: underlying.cause,
    };
  }
  return underlying;
}

export function compareBuildSandboxToProd(sandbox, prod) {
  const buildSandbox = classifyFamily4(sandbox);
  const production = classifyFamily4(prod);
  const differs = buildSandbox.cause !== production.cause
    || sandbox?.sameChild?.code !== prod?.sameChild?.code
    || sandbox?.parent?.code !== prod?.parent?.code
    || sandbox?.sameNetns !== prod?.sameNetns;
  return {
    differs,
    ipv6DualStackExplains: false,
    buildSandbox,
    production,
  };
}

export function probeFamily4Health(port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const request = get({
      host: PROBE_HOST,
      port,
      path: "/api/health",
      family: 4,
      autoSelectFamily: false,
      agent: false,
      signal: AbortSignal.timeout(5000),
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > BODY_CAP) {
          request.destroy(Object.assign(new Error("cap"), { code: "RESPONSE_CAP" }));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", (error) => finish(fail(error.code || "response-error")));
      response.on("end", () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { body = null; }
        finish({
          ok: response.statusCode === 200 && body?.service === "samedaydesk",
          status: response.statusCode,
          code: null,
          service: body?.service ?? null,
        });
      });
    });
    request.on("error", (error) => finish(fail(error.code || error.name || "probe-error")));
  });
}

export function probeFamily4Surface() {
  return new Promise((resolve) => {
    let settled = false;
    const server = createServer();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      server.close(() => resolve({ host: PROBE_HOST, family: 4, ...result }));
    };
    server.once("error", (error) => {
      finish({ capable: false, stage: "bind", code: error.code || "bind-error", address: null });
    });
    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      if (!isIpv4TcpAddress(address)) {
        finish({ capable: false, stage: "address", code: "address-null", address: address ?? null });
        return;
      }
      let socketSettled = false;
      const socket = net.connect({ host: PROBE_HOST, port: address.port, family: 4 });
      const endSocket = (result) => {
        if (socketSettled) return;
        socketSettled = true;
        socket.destroy();
        finish(result);
      };
      socket.setTimeout(5000, () => endSocket({ capable: false, stage: "connect", code: "TIMEOUT", address }));
      socket.once("connect", () => endSocket({ capable: true, stage: "connect", code: null, address }));
      socket.once("error", (error) => endSocket({
        capable: false,
        stage: "connect",
        code: error.code || "connect-error",
        address,
      }));
    });
  });
}
