import { createServer } from "node:http";

/**
 * Loopback proxy: forwards to I01, then drops the 201 body after the
 * upstream commit. Lost-response tests must commit first, then lose the body.
 */
export function createCommitThenDropProxy({
  upstream,
  dropGrant201 = false,
  dropClaim201 = false,
  grantStatusAfterCommit = null,
} = {}) {
  const origin = new URL(upstream).origin;
  const counts = { grantPosts: 0, claimPosts: 0 };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    const response = await fetch(`${origin}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : raw,
    });
    const text = await response.text();
    const isGrant = req.method === "POST" && req.url === "/v1/contributor-tokens";
    const isClaim = req.method === "POST" && /\/v1\/tasks\/[^/]+\/claims$/.test(req.url);
    if (isGrant) counts.grantPosts += 1;
    if (isClaim) counts.claimPosts += 1;
    const drop = response.status === 201 && ((isGrant && dropGrant201) || (isClaim && dropClaim201));
    const outHeaders = { "content-type": response.headers.get("content-type") || "application/json" };
    if (isGrant && grantStatusAfterCommit && response.status === 201) {
      res.writeHead(grantStatusAfterCommit, outHeaders);
      res.end(JSON.stringify({ error: { code: "unavailable", message: "post-commit unavailable" } }));
      return;
    }
    if (drop) {
      res.writeHead(201, outHeaders);
      res.end("");
      return;
    }
    res.writeHead(response.status, outHeaders);
    res.end(text);
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          resolve({
            baseUrl: `http://127.0.0.1:${address.port}`,
            port: address.port,
            counts,
            close: () => new Promise((ok, rej) => server.close((err) => (err ? rej(err) : ok()))),
          });
        });
        server.once("error", reject);
      });
    },
  };
}
