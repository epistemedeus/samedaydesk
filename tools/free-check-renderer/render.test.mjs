// The guard against a page that tries every way out: a private host, a metadata name, a redirect to
// a link-local address, loopback literals and a name that rebinds from public to private. Names map
// to loopback aliases so no outside network is used; 127.0.0.2 plays the public site and 127.0.0.3
// the private service that must never be reached.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { render } from "./render.mjs";
import { publicAddress } from "./guard.mjs";

const listen = (host, handler) => new Promise((resolve) => { const server = http.createServer(handler); server.listen(0, host, () => resolve(server)); });

test("public address classification", () => {
  for (const address of ["10.1.2.3", "172.20.0.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "224.0.0.1"]) assert.equal(publicAddress(address), false, address);
  for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) assert.equal(publicAddress(address), true, address);
});

test("rendered words are counted and no private address is ever reached", async () => {
  const secretHits = [];
  const secret = await listen("127.0.0.3", (req, res) => { secretHits.push(req.url); res.end("secret"); });
  const port = secret.address().port;
  const site = await listen("127.0.0.2", (req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { location: `http://169.254.169.254:${port}/latest/meta-data` }).end(); return; }
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>t</title><body><p>Short.</p><script>
        document.body.insertAdjacentHTML('beforeend', '<p>' + 'word '.repeat(200) + '</p>');
        const tries = ['http://private.test:${port}/a', 'http://metadata.test:${port}/b', 'http://127.0.0.1:${port}/c', 'http://[::1]:${port}/d',
          'http://rebind.test:${port}/e', 'http://rebind.test:${port}/f', '/redirect'];
        for (const u of tries) fetch(u).catch(() => {});
        const img = new Image(); img.src = 'http://10.0.0.9:${port}/g';
      </script></body>`);
      return;
    }
    res.end("ok");
  });
  // Rebinding: the first answer is public, every later one private.
  let rebinds = 0;
  const names = { "public.test": ["127.0.0.2"], "private.test": ["127.0.0.3"], "metadata.test": ["127.0.0.3"] };
  const lookup = async (host) => host === "rebind.test" ? [{ address: rebinds++ === 0 ? "127.0.0.2" : "127.0.0.3" }] : (names[host] || []).map((address) => ({ address }));
  const isPublic = (address) => address === "127.0.0.2";
  try {
    const result = await render(`http://public.test:${site.address().port}/`, { initialWords: 2, budgetMs: 8_000, guard: { lookup, isPublic, ports: [site.address().port, port] } });
    assert.ok(result.words >= 200, JSON.stringify(result));
    assert.ok(result.extraWords >= 198);
    assert.deepEqual(secretHits, [], "the private service was reached");
    const refused = result.refused.join(" | ");
    for (const expect of ["private.test", "metadata.test", "127.0.0.1", "::1", "169.254.169.254", "10.0.0.9", "rebind.test"]) assert.match(refused, new RegExp(expect.replace(/[.]/g, "\\.")), refused);
  } finally { secret.close(); site.close(); }
});

test("the byte cap stops a page that streams forever", async () => {
  const site = await listen("127.0.0.2", (req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    const chunk = "<p>" + "x".repeat(64 * 1024) + "</p>";
    const timer = setInterval(() => res.write(chunk), 5);
    req.on("close", () => clearInterval(timer));
  });
  try {
    const started = Date.now();
    const result = await render(`http://public.test:${site.address().port}/`, { budgetMs: 4_000, guard: { lookup: async () => [{ address: "127.0.0.2" }], isPublic: (a) => a === "127.0.0.2", ports: [site.address().port], maxBytes: 2_000_000 } }).catch((error) => ({ error: error.message }));
    assert.ok(Date.now() - started < 9_000);
    if (!result.error) assert.equal(result.capped, true);
  } finally { site.close(); }
});

test("a page whose own address is refused is not measured", async () => {
  await assert.rejects(render("http://metadata.test/latest/meta-data", { budgetMs: 4_000, guard: { lookup: async () => [{ address: "169.254.169.254" }] } }), /not loaded/);
  await assert.rejects(render("http://169.254.169.254/latest/meta-data", { budgetMs: 4_000 }), /not loaded/);
});
