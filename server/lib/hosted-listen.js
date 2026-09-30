import http from "node:http";

// One IPV6_V6ONLY=0 socket on "::" accepts both 127.0.0.1 and ::1.
// An IPv4-only 0.0.0.0 socket refuses ::1 with ECONNREFUSED. When IPv6
// cannot be bound, fall back to 0.0.0.0 so the process still listens.
const RECOVERABLE_BIND = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL"]);

export function normalizeListenPort(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const port = Number(value);
    if (port <= 65535) return port;
  }
  const error = new Error("PORT must be an integer from 0 to 65535");
  error.code = "ERR_INVALID_PORT";
  throw error;
}

export function listenHosted(requestListener, port, onListening, options = {}) {
  const numeric = normalizeListenPort(port);
  const server = http.createServer(requestListener);
  const primaryHost = options.primaryHost || "::";
  let attemptedFallback = false;

  const finish = () => {
    server.removeListener("error", onError);
    const bound = server.address();
    if (bound == null || typeof bound !== "object" || !Number.isInteger(bound.port)) {
      const error = new Error("server.address() was not a bound TCP address after listen");
      error.code = "ERR_INVALID_ADDRESS";
      server.emit("error", error);
      return;
    }
    if (typeof onListening === "function") onListening(bound);
  };

  function onError(error) {
    if (!attemptedFallback && RECOVERABLE_BIND.has(error?.code)) {
      attemptedFallback = true;
      process.nextTick(() => server.listen(numeric, "0.0.0.0", finish));
      return;
    }
    server.removeListener("error", onError);
    throw error;
  }

  server.on("error", onError);
  server.listen({ port: numeric, host: primaryHost, ipv6Only: false }, finish);
  return server;
}
