// The only way the renderer's browser reaches the network: a local forward proxy that resolves
// each host itself, refuses the connection if any address is not public, and connects to the
// address it checked. Chrome never resolves names (a proxy is set and nothing bypasses it), so a
// name that answers public first and private later (DNS rebinding) is checked on every connection.
// Redirects and subresources are new requests through the same proxy, so each is checked too.
import http from "node:http";
import net from "node:net";
import dns from "node:dns/promises";

const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  // IPv4-mapped addresses (::ffff:a.b.c.d) are unwrapped and judged as IPv4 in publicAddress; a
  // ::ffff:0:0/96 rule here would also match every IPv4 address.
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) blocked.addSubnet(address, prefix, "ipv6");
// Names that only resolve inside a host's network (Railway's private network is *.railway.internal,
// on fd12::/16, inside the fc00::/7 block above).
const BLOCKED_NAMES = /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.railway\.internal|metadata\.google\.internal|metadata)$/i;

/** Public unicast only. IPv4-mapped IPv6 is judged by its IPv4 address. */
export function publicAddress(address) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return publicAddress(mapped[1]);
  const family = net.isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Start the guard. Options (all have safe defaults; tests inject lookup and isPublic):
 *   lookup(host) -> [{ address }]   isPublic(address) -> boolean
 *   maxBytes, maxRequests            caps for the whole render
 *   ports                            destination ports allowed (80 and 443)
 * Returns { port, stats, close() }.
 */
export async function startGuard({ lookup = (host) => dns.lookup(host, { all: true, verbatim: true }), isPublic = publicAddress, maxBytes = 8_000_000, maxRequests = 150, ports = [80, 443] } = {}) {
  const stats = { requests: 0, bytes: 0, refused: [], capped: false };
  const sockets = new Set();
  const refuse = (host, why) => { stats.refused.push(`${host}: ${why}`); };
  // Resolve once, refuse if any answer is not public, return the address to connect to.
  const admit = async (host) => {
    if (stats.requests >= maxRequests || stats.bytes >= maxBytes) { stats.capped = true; refuse(host, "cap"); return null; }
    stats.requests += 1;
    const bare = host.replace(/^\[|\]$/g, "");
    if (BLOCKED_NAMES.test(bare)) { refuse(bare, "name"); return null; }
    let answers;
    try { answers = net.isIP(bare) ? [{ address: bare }] : await lookup(bare); } catch { refuse(bare, "dns"); return null; }
    if (!answers.length || answers.some((answer) => !isPublic(answer.address))) { refuse(bare, `address ${answers.map((answer) => answer.address).join(",")}`); return null; }
    return answers[0].address;
  };
  const count = (chunk) => { stats.bytes += chunk.length; if (stats.bytes > maxBytes) { stats.capped = true; return false; } return true; };
  const track = (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); return socket; };

  const server = http.createServer(async (req, res) => {
    // A reset on either side ends that request only; it never throws out of the guard.
    req.on("error", () => res.destroy());
    res.on("error", () => req.destroy());
    // Plain http:// requests arrive in absolute form.
    let target;
    try { target = new URL(req.url); } catch { res.writeHead(400).end(); return; }
    if (target.protocol !== "http:") { res.writeHead(400).end(); return; }
    if (!ports.includes(Number(target.port || 80))) { refuse(target.hostname, `port ${target.port}`); res.writeHead(403).end(); return; }
    const address = await admit(target.hostname);
    if (!address) { res.writeHead(403).end(); return; }
    const upstream = http.request({ host: address, port: target.port || 80, method: req.method, path: target.pathname + target.search,
      headers: Object.fromEntries(Object.entries({ ...req.headers, host: target.host }).filter(([name]) => name !== "proxy-connection")), timeout: 10_000 }, (response) => {
      response.on("error", () => res.destroy());
      res.writeHead(response.statusCode, response.headers);
      response.on("data", (chunk) => { if (!count(chunk)) { response.destroy(); res.destroy(); } });
      response.pipe(res);
    });
    upstream.on("error", () => res.destroy());
    upstream.on("timeout", () => upstream.destroy());
    req.pipe(upstream);
  });
  // https:// and wss:// arrive as CONNECT host:port; TLS still verifies the name end to end.
  server.on("connect", async (req, client, head) => {
    track(client);
    const [host, port = "443"] = req.url.startsWith("[") ? [req.url.slice(1, req.url.indexOf("]")), req.url.split("]:")[1]] : req.url.split(":");
    if (!ports.includes(Number(port))) { refuse(host, `port ${port}`); client.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
    const address = await admit(host);
    if (!address) { client.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
    const upstream = track(net.connect({ host: address, port: Number(port), timeout: 10_000 }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) upstream.write(head);
      upstream.on("data", (chunk) => { if (!count(chunk)) { upstream.destroy(); client.destroy(); } else client.write(chunk); });
      client.pipe(upstream);
    }));
    upstream.on("error", () => client.destroy());
    upstream.on("timeout", () => upstream.destroy());
    client.on("error", () => upstream.destroy());
  });
  server.on("connection", (socket) => { track(socket); socket.on("error", () => socket.destroy()); });
  server.on("clientError", (error, socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port, stats,
    close: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }),
  };
}
