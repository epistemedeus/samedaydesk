import express from "express";
import { WatchError } from "./errors.mjs";
import { watchOptIn } from "./limits.mjs";
import { armScheduler } from "./scheduler.mjs";
import { createManagedWatch } from "./service.mjs";
import { openFileWatchStore } from "./store-file.mjs";
import { openPgWatchStore } from "./store-pg.mjs";

function sendError(res, error) {
  const status = error instanceof WatchError ? error.status : 503;
  const code = error instanceof WatchError ? error.code : "store_unavailable";
  res.status(status).json({ error: { code, message: error.message || "managed watch failed" } });
}

function bearer(req) {
  const header = req.header("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] || "";
}

async function openConfiguredStore(env) {
  const databaseUrl = String(env.CORRESPONDENCE_DATABASE_URL || "").trim();
  const directory = String(env.MANAGED_WATCH_STORE_DIR || "").trim();
  if (databaseUrl) return openPgWatchStore({ databaseUrl, schema: "pilot_correspondence" });
  if (directory) return openFileWatchStore(directory);
  return null;
}

export function mountManagedWatch(app, options = {}) {
  const env = options.env || process.env;
  let enabled = false;
  let invalid = null;
  if (options.enabled === true) enabled = true;
  else if (options.enabled === false) enabled = false;
  else {
    try { enabled = watchOptIn(env); }
    catch (error) { invalid = error; }
  }
  const handle = { enabled: false, close: async () => {}, arm() { return null; } };
  if (!enabled && !invalid) return handle;
  if (invalid) {
    const disabled = express.Router();
    disabled.get("/healthz", (_req, res) => {
      res.status(200).json({
        ok: false,
        enabled: false,
        reason: "invalid_config",
        paidServiceLaunch: false,
        subscriptionOffered: false,
      });
    });
    app.use("/api/managed-watch", disabled);
    return handle;
  }
  const router = express.Router();
  router.use(express.json({ limit: "32kb" }));
  let service = options.service || null;
  let store = options.store || null;
  let opening = null;

  async function ready() {
    if (invalid) throw invalid;
    if (service) return service;
    if (!opening) {
      opening = (async () => {
        store = store || await openConfiguredStore(env);
        if (!store) throw new WatchError("unconfigured", "managed watch store is not configured", 503);
        service = createManagedWatch({
          store,
          now: options.now,
          readSource: options.readSource,
          hooks: options.hooks,
        });
        return service;
      })();
    }
    return opening;
  }

  router.get("/healthz", async (_req, res) => {
    if (invalid || !enabled) {
      res.status(200).json({ ok: false, enabled: false, reason: invalid ? "invalid_config" : "unconfigured", paidServiceLaunch: false, subscriptionOffered: false });
      return;
    }
    try {
      await ready();
      res.status(200).json({
        ok: true,
        enabled: true,
        service: "managed-watch",
        scheduler: handle.schedulerState(),
        paidServiceLaunch: false,
        subscriptionOffered: false,
        proposedManagedPrice: null,
      });
    } catch (error) {
      res.status(200).json({ ok: false, enabled: false, reason: error.code || "unconfigured", paidServiceLaunch: false, subscriptionOffered: false });
    }
  });

  async function replan() {
    if (!handle.scheduler) return;
    try {
      await handle.scheduler.plan();
    } catch (error) {
      console.error("managed_watch_replan_failed", error?.code || "error");
    }
  }

  function route(handler) {
    return async (req, res) => {
      try {
        if (!enabled) throw new WatchError("unconfigured", "managed watch is not enabled", 503);
        const current = await ready();
        await handler(current, req, res);
      } catch (error) {
        sendError(res, error);
      }
    };
  }

  router.post("/enrollments", route(async (current, req, res) => {
    res.status(201).json(await current.enroll({ token: bearer(req), body: req.body }));
    await replan();
  }));
  router.get("/enrollments/:taskId", route(async (current, req, res) => {
    res.json(await current.retrieve({ token: bearer(req), taskId: req.params.taskId }));
  }));
  router.post("/enrollments/:taskId/pause", route(async (current, req, res) => {
    res.json(await current.pause({ token: bearer(req), taskId: req.params.taskId }));
    await replan();
  }));
  router.post("/enrollments/:taskId/resume", route(async (current, req, res) => {
    res.json(await current.resume({ token: bearer(req), taskId: req.params.taskId }));
    await replan();
  }));
  router.post("/enrollments/:taskId/cancel", route(async (current, req, res) => {
    res.json(await current.cancel({ token: bearer(req), taskId: req.params.taskId }));
    await replan();
  }));
  router.post("/due", route(async (current, req, res) => {
    const mode = options.allowDeliveryMode && req.body?.deliveryMode === "unknown" ? "unknown" : "accepted";
    res.json(await current.runDueForGrant({ token: bearer(req), deliveryMode: mode }));
    await replan();
  }));

  app.use("/api/managed-watch", router);
  handle.enabled = enabled;
  handle.close = async () => {
    handle.scheduler?.stop();
    if (store?.close) await store.close();
  };
  handle.schedulerState = () => ({
    enabled: Boolean(handle.scheduler),
    armed: Boolean(handle.scheduler?.armed),
    nextDueAt: handle.scheduler?.nextDueAt ?? null,
  });
  handle.arm = async () => {
    if (handle.scheduler) return handle.scheduler;
    const current = await ready();
    const scheduler = armScheduler(current, {
      onError(error) { console.error("managed_watch_due_failed", error?.code || "error"); },
    });
    handle.scheduler = scheduler;
    await scheduler.plan();
    return scheduler;
  };
  handle.service = () => service;
  return handle;
}
