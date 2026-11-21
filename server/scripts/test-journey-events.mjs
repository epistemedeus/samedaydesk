import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { recordJourney, journeyPath, reportRequestError } from "../lib/journey-events.js";

test("current journey receiver strips capabilities and personal fields and refuses browser payment authority", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sds-journey-"));
  try {
    const file = join(dir, "events.jsonl"), env = { SDS_JOURNEY_EVENTS_PATH: file };
    const props = { path: "/care/intake?email=private#key=private", offer: "agent_front_door", state: "paid", email: "private@example.test", order: "private" };
    assert.equal(recordJourney("payment_confirmed", props, "browser", env), false);
    assert.equal(recordJourney("payment_confirmed", props, "server", env), true);
    assert.equal(recordJourney("form_sent", props, "browser", env), true);
    assert.equal(recordJourney("unknown", props, "browser", env), false);
    assert.equal(journeyPath("/receipts/secret?key=private"), "/receipts/:id");
    assert.equal(journeyPath("https://example.test/private"), null);
    const bytes = await readFile(file, "utf8");
    assert.doesNotMatch(bytes, /private|email|order|key/);
    assert.equal(bytes.trim().split("\n").length, 2);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(recordJourney("form_sent", props, "browser", { SDS_JOURNEY_EVENTS_PATH: "/nonexistent/events" }), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("prepared error transport is disabled by default and confirms only a real receiver response", async () => {
  assert.deepEqual(await reportRequestError("care_request", {}), { enabled: false });
  const received = [];
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    received.push(JSON.parse(body));
    if (req.url === "/lost") req.socket.destroy();
    else if (req.url === "/redirect") res.writeHead(302, { location: "/ok" }).end();
    else res.writeHead(202).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, ok] of [["/ok", true], ["/lost", false], ["/redirect", false]]) {
      assert.deepEqual(await reportRequestError("care_request", { SDS_PRIVATE_PREVIEW: "1", SDS_ERROR_TRACKER_URL: base + path }), { enabled: true, received: ok });
    }
    assert.equal(received.length, 3, "lost or redirect response must never send a second event");
    assert.deepEqual(received[0], { event: "request_error", state: "care_request", path: "/api", service: "samedaydesk", schema: "samedaydesk.error.v1", environment: "preview" });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
