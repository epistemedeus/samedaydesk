import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRequestsRouter } from "../routes/requests.js";
import { createMemoryTaskRequestStore, validateTaskRequest } from "../lib/task-requests.js";

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/requests", router);
  return new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
}

test("validation names the field to fix", () => {
  assert.equal(validateTaskRequest({ email: "nope", task: "a long enough task" }).error, "email");
  assert.equal(validateTaskRequest({ email: "a@b.co", task: "short" }).error, "task");
  assert.deepEqual(validateTaskRequest({ email: " A@B.co ", website: "", task: "Make our quote route payable by agents." }).request,
    { email: "a@b.co", website: null, task: "Make our quote route payable by agents." });
});

test("a request is stored, confirmed to the requester and announced to the desk", async () => {
  const store = createMemoryTaskRequestStore();
  const sent = [];
  const notify = { sendTaskRequestReceived: async (m) => sent.push(["requester", m]), notifyAdmin: async (subject) => sent.push(["desk", subject]) };
  const server = await serve(createRequestsRouter({ store, notify }));
  const base = `http://127.0.0.1:${server.address().port}/api/requests`;
  try {
    const ok = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@shop.example", website: "shop.example", task: "Let agents buy our gift cards." }) });
    assert.equal(ok.status, 201);
    const body = await ok.json();
    assert.match(body.reference, /^SDD-[0-9A-F]{8}$/);
    assert.equal(store.rows.length, 1);
    assert.equal(sent[0][0], "requester");
    assert.equal(sent[0][1].reference, body.reference);
    assert.equal(sent[1][0], "desk");

    const bad = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "x", task: "Let agents buy." }) });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: { field: "email" } });

    const robot = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "r@b.co", task: "Buy cheap pills now please", company_fax: "1" }) });
    assert.equal(robot.status, 201);
    assert.equal(store.rows.length, 1);
  } finally {
    server.close();
  }
});
