import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskState, taskStateToJSON } from "@a2a-js/sdk";
import { UserBuilder } from "@a2a-js/sdk/server/express";

import { CountingInterceptor, createClient, errorShape, userMessage } from "./client.mjs";
import { FOREIGN_TOKEN, HONESTY, OWNER_TOKEN, POLL_MS, SCHEMA } from "./constants.mjs";
import { ADAPTER } from "./identity.mjs";
import { startFixtureServer } from "./server.mjs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pins = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../pins.json"), "utf8"),
);

function stateName(task) {
  const state = task?.status?.state;
  if (state == null) return null;
  try {
    return taskStateToJSON(state);
  } catch {
    return String(state);
  }
}

function payloadCase(event) {
  return event?.payload?.$case || null;
}

function eventState(event) {
  const p = event?.payload;
  if (!p) return null;
  if (p.$case === "task") return { kind: "task", id: p.value?.id, state: stateName(p.value) };
  if (p.$case === "statusUpdate") {
    return {
      kind: "statusUpdate",
      id: p.value?.taskId,
      state: stateName({ status: p.value?.status }),
      finalish: p.value?.status?.state,
    };
  }
  return { kind: p.$case };
}

async function waitUntil(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function drainStream(stream, bag) {
  try {
    for await (const event of stream) {
      bag.events.push({ t: Date.now(), iso: new Date().toISOString(), ...eventState(event) });
      const p = event?.payload;
      if (p?.$case === "task" && p.value?.id) bag.taskId = p.value.id;
    }
  } catch (err) {
    bag.streamError = errorShape(err);
  } finally {
    bag.streamEndedAt = new Date().toISOString();
  }
}

export async function runJourney() {
  const workRoot = mkdtempSync(join(tmpdir(), "w5-a2a-cancel-"));
  const server = await startFixtureServer({ workRoot });
  const steps = [];
  const ownerCount = new CountingInterceptor();
  const foreignCount = new CountingInterceptor();
  let owner;
  let foreign;
  try {
    owner = await createClient(server.origin, { token: OWNER_TOKEN, interceptor: ownerCount });
    foreign = await createClient(server.origin, { token: FOREIGN_TOKEN, interceptor: foreignCount });

    const card = await fetch(`${server.origin}/.well-known/agent-card.json`).then((r) => r.json());
    steps.push({
      step: "local_card",
      streaming: card.capabilities?.streaming === true,
      protocolVersion: card.supportedInterfaces?.[0]?.protocolVersion,
      productionCardTouched: false,
    });

    const bag = { events: [], taskId: null };
    const stream = owner.sendMessageStream(userMessage("run a long local job"));
    const draining = drainStream(stream, bag);
    await waitUntil(() => bag.taskId, 8000, "server task id");
    const serverTaskId = bag.taskId;
    const streamWorking = bag.events.find((e) => e.state === "TASK_STATE_WORKING");

    let polls = 0;
    const tPollStart = Date.now();
    const live = await waitUntil(async () => {
      polls += 1;
      const task = await owner.getTask({ tenant: "", id: serverTaskId, historyLength: 0 });
      if (stateName(task) === "TASK_STATE_WORKING" || stateName(task) === "TASK_STATE_SUBMITTED") {
        return { task, polls, ms: Date.now() - tPollStart, state: stateName(task) };
      }
      return null;
    }, 8000, "direct getTask current read");
    const childBefore = server.executor.snapshot(serverTaskId);
    steps.push({
      step: "direct_read_baseline",
      serverTaskId,
      streamWorkingAt: streamWorking?.iso || null,
      getTaskState: live.state,
      getTaskPolls: live.polls,
      getTaskMs: live.ms,
      note: "PR108 compared a stale snapshot to a later current kernel GET. It did not measure notice vs direct current read. These numbers are this fixture only.",
    });

    const localUuid = crypto.randomUUID();
    let minted;
    try {
      await owner.sendMessage(userMessage("mint", { taskId: localUuid }));
      minted = { ok: true };
    } catch (err) {
      minted = { ok: false, ...errorShape(err) };
    }
    steps.push({
      step: "local_uuid_not_interchangeable",
      localUuid,
      serverTaskId,
      equal: localUuid === serverTaskId,
      error: minted,
    });

    let wrong;
    try {
      await owner.cancelTask({ tenant: "", id: crypto.randomUUID(), metadata: {} });
      wrong = { ok: true };
    } catch (err) {
      wrong = { ok: false, ...errorShape(err) };
    }
    const stillRunningAfterWrong = server.executor.snapshot(serverTaskId).running;
    steps.push({
      step: "wrong_id",
      error: wrong,
      childStillRunning: stillRunningAfterWrong,
    });

    let foreignCancel;
    try {
      await foreign.cancelTask({ tenant: "", id: serverTaskId, metadata: {} });
      foreignCancel = { ok: true };
    } catch (err) {
      foreignCancel = { ok: false, ...errorShape(err) };
    }
    const stillRunningAfterForeign = server.executor.snapshot(serverTaskId).running;
    steps.push({
      step: "foreign_client",
      error: foreignCancel,
      childStillRunning: stillRunningAfterForeign,
    });

    const tCancel = Date.now();
    const cancelled = await owner.cancelTask({ tenant: "", id: serverTaskId, metadata: {} });
    const tCancelReturned = Date.now();
    await draining;
    const after = await owner.getTask({ tenant: "", id: serverTaskId, historyLength: 0 });
    const childAfter = server.executor.snapshot(serverTaskId);
    const streamCanceled = bag.events.find((e) => e.state === "TASK_STATE_CANCELED");
    steps.push({
      step: "owner_cancel_confirmed",
      cancelReturnedState: stateName(cancelled),
      getTaskState: stateName(after),
      streamCanceledAt: streamCanceled?.iso || null,
      cancelRpcMs: tCancelReturned - tCancel,
      childRunning: childAfter.running,
      childExit: childAfter.exit,
      heartbeatsBeforeStop: childAfter.heartbeat?.ticks ?? childBefore.heartbeat?.ticks ?? 0,
      startedFileWritten: Boolean(childAfter.exit || childBefore.heartbeat),
      irreversibleLocalEffects: "child start/heartbeat files already written; not rolled back",
    });

    let replay;
    try {
      const again = await owner.cancelTask({ tenant: "", id: serverTaskId, metadata: {} });
      replay = { ok: true, state: stateName(again) };
    } catch (err) {
      replay = { ok: false, ...errorShape(err) };
    }
    steps.push({ step: "replay_cancel", result: replay, childStillDead: !childAfter.running });

    const shortBag = { events: [], taskId: null };
    const shortStream = owner.sendMessageStream(userMessage("short job"));
    const shortDrain = drainStream(shortStream, shortBag);
    await waitUntil(() => shortBag.taskId, 8000, "short task id");
    await shortDrain;
    const shortFinal = await owner.getTask({ tenant: "", id: shortBag.taskId, historyLength: 0 });
    let race;
    try {
      await owner.cancelTask({ tenant: "", id: shortBag.taskId, metadata: {} });
      race = { ok: true };
    } catch (err) {
      race = { ok: false, ...errorShape(err) };
    }
    steps.push({
      step: "cancel_racing_completion",
      shortState: stateName(shortFinal),
      cancel: race,
    });

    const unauthServer = await startFixtureServer({
      userBuilder: UserBuilder.noAuthentication,
      workRoot: join(workRoot, "unauth"),
    });
    try {
      const u1 = await createClient(unauthServer.origin, { token: OWNER_TOKEN });
      const u2 = await createClient(unauthServer.origin, { token: FOREIGN_TOKEN });
      const uBag = { events: [], taskId: null };
      const uStream = u1.sendMessageStream(userMessage("run a long local job"));
      const uDrain = drainStream(uStream, uBag);
      await waitUntil(() => uBag.taskId, 8000, "unauth task");
      let cross;
      try {
        const c = await u2.cancelTask({ tenant: "", id: uBag.taskId, metadata: {} });
        cross = { ok: true, state: stateName(c) };
      } catch (err) {
        cross = { ok: false, ...errorShape(err) };
      }
      await uDrain;
      steps.push({
        step: "sdk_default_unauthenticated_scope",
        note: "UserBuilder.noAuthentication maps every caller to owner 'unknown'. Tokens are ignored. This is the SDK default, not authorization.",
        foreignCouldCancel: cross.ok === true,
        result: cross,
      });
    } finally {
      await unauthServer.stop();
    }

    const ok =
      Boolean(serverTaskId) &&
      minted.ok === false &&
      (minted.reason === "TASK_NOT_FOUND" || /not found/i.test(minted.message || "")) &&
      wrong.ok === false &&
      stillRunningAfterWrong === true &&
      foreignCancel.ok === false &&
      stillRunningAfterForeign === true &&
      stateName(cancelled) === "TASK_STATE_CANCELED" &&
      stateName(after) === "TASK_STATE_CANCELED" &&
      childAfter.running === false &&
      childAfter.exit?.reason === "SIGTERM" &&
      replay.ok === true &&
      replay.state === "TASK_STATE_CANCELED" &&
      race.ok === false &&
      (race.reason === "TASK_NOT_CANCELABLE" || /not cancelable/i.test(race.message || "")) &&
      steps.find((s) => s.step === "sdk_default_unauthenticated_scope")?.foreignCouldCancel === true;

    return {
      schema: SCHEMA,
      ok,
      ...HONESTY,
      pins,
      adapter: ADAPTER,
      origin: server.origin,
      ownerCalls: ownerCount.calls.length,
      foreignCalls: foreignCount.calls.length,
      subscribe: {
        how: "Official Client.sendMessageStream then cancelTask({ id: server-issued task.id }) with the same authenticated User. Confirm stop via child exit plus TASK_STATE_CANCELED, then getTask.",
      },
      nextFieldTest:
        "One maintained A2A client against a hosted card that actually implements cancelTask and streaming. Do not use the current discovery-only production card. No payment.",
      steps,
    };
  } finally {
    await server.stop();
  }
}
