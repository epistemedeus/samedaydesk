// Test wiring below DNS/HTTP/TLS: record the numeric address passed to libuv,
// then route that TCP connection to a local fixture. Admission, lookup, agents,
// HTTP messages and TLS verification all remain the real production code.
// Node 22's TCP binding is intentionally confined to this test helper.
import http from "node:http";
import { setImmediate as immediate } from "node:timers/promises";

export const PUBLIC_IP = "93.184.216.34";
export const OTHER_PUBLIC_IP = "1.1.1.1";
export const publicLookup = async () => [{ address: PUBLIC_IP, family: 4 }];

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

export async function localServer(handler) {
  const server = http.createServer(handler);
  await listen(server);
  return server;
}

export function wireSockets(routes) {
  const { TCP } = process.binding("tcp_wrap");
  const originals = { connect: TCP.prototype.connect, connect6: TCP.prototype.connect6 };
  const attempts = [];
  for (const method of Object.keys(originals)) {
    TCP.prototype[method] = function (request, address, port) {
      const route = routes.find((r) => r.address === address && (!r.port || r.port === port));
      if (!route) return originals[method].call(this, request, address, port);
      attempts.push({ address, port });
      return originals.connect.call(this, request, "127.0.0.1", route.server.address().port);
    };
  }
  return {
    attempts,
    restore() { Object.assign(TCP.prototype, originals); },
  };
}

export async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

// A close callback can precede libuv's resource-destruction notification. Poll
// that notification with a hard bound; never hide persistent handles or force
// the process to exit. The child must subsequently exit on its own as well.
export async function transportResources() {
  const until = Date.now() + 500;
  let resources;
  do {
    await immediate();
    resources = process.getActiveResourcesInfo().filter((x) => /TCP|UDP|Timeout|GetAddrInfo|QueryReq/.test(x));
  } while (resources.length && Date.now() < until);
  return resources;
}
