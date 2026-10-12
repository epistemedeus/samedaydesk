import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_TOKEN,
  closeServer,
  createReservedTask,
  dropSchema,
  json,
  listen,
  openStore,
} from "./helpers.js";

test("GET task includes A3 three-dimension work-gate; mixedScore is displayOnly never authority", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId } = await createReservedTask(baseUrl);
    const owner = await json(baseUrl, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    assert.equal(owner.status, 200);
    const workability = (owner.body as {
      task: {
        workability: {
          doNotStartWork: boolean;
          startWork: false;
          ignoredMixedScore: true;
          claimAuthority: string;
          packet: {
            mixedScore: { displayOnly: true };
            funding: { class: string };
            effort: { winProbability: string };
            eligibility: { claimAuthority: string };
          };
        };
      };
    }).task.workability;
    assert.equal(workability.startWork, false);
    assert.equal(workability.doNotStartWork, true);
    assert.equal(workability.ignoredMixedScore, true);
    assert.equal(workability.packet.mixedScore.displayOnly, true);
    assert.equal(workability.packet.effort.winProbability, "unknown");
    assert.notEqual(workability.packet.funding.class, "escrowed");
    assert.notEqual(workability.claimAuthority, "agent");
    assert.notEqual(workability.packet.eligibility.claimAuthority, "agent");

    const pub = await json(baseUrl, `/v1/tasks/${taskId}`);
    assert.equal(pub.status, 200);
    const pubGate = (pub.body as { task: { workability: { doNotStartWork: boolean; packet: { mixedScore: { displayOnly: true } } } } }).task.workability;
    assert.equal(pubGate.doNotStartWork, true);
    assert.equal(pubGate.packet.mixedScore.displayOnly, true);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
