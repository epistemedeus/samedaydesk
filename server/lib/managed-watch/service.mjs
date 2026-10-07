import { randomBytes } from "node:crypto";
import { WatchError, asWatchError } from "./errors.mjs";
import { trimResults } from "./claim.mjs";
import {
  assertOwnerId,
  hashGrantToken,
  iso,
  normalizeEnrollment,
  plusMs,
  publicWatch,
  DEFAULTS,
} from "./limits.mjs";
import { loadPinnedMonitor } from "./runtime.mjs";
import { readPinnedSnapshot } from "./source.mjs";

function pidAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function blankCosts() {
  return {
    sourceCalls: 0,
    sourceBytes: 0,
    storageBytes: 0,
    runtimeMs: 0,
    operations: 0,
    deliveryPosts: 0,
    unknownDeliveries: 0,
    providerMarginalCost: null,
    providerMarginalCostStatus: "unknown",
    modelTokens: null,
    savings: null,
    profit: null,
    setupReview: "not-measured",
  };
}

function emptyResult(fields) {
  return {
    operationId: fields.operationId ?? null,
    at: fields.at,
    outcome: fields.outcome,
    evidenceClass: fields.evidenceClass ?? null,
    failureCode: fields.failureCode ?? null,
    usefulChange: Boolean(fields.usefulChange),
    usefulNegative: Boolean(fields.usefulNegative),
    delivered: fields.delivered === true,
    deliveryState: fields.deliveryState ?? null,
    capture: fields.capture ?? null,
    publicSourceChanged: fields.publicSourceChanged === true,
    naturalCustomerDemand: false,
    sourceCalls: fields.sourceCalls ?? 0,
    sourceBytes: fields.sourceBytes ?? 0,
    runtimeMs: fields.runtimeMs ?? 0,
  };
}

async function openMonitor(watch, nowIso, deliveryMode, counter) {
  const { monitor } = await loadPinnedMonitor();
  const memory = monitor.createMemoryStore(watch.monitorState);
  const api = monitor.createMonitor({
    store: memory,
    clock: monitor.frozenClock(nowIso),
    receivers: {
      "retained-pull": {
        kind: "injected",
        async send() {
          counter.posts += 1;
          if (deliveryMode === "unknown") return { outcome: "unknown", httpStatus: null, error: "lost_reply" };
          return { outcome: "accepted", httpStatus: 200, error: null };
        },
        async reconcile() {
          return { outcome: "unknown", httpStatus: null, error: "reconcile_unconfirmed" };
        },
      },
    },
  });
  return { api, memory };
}

export function createManagedWatch({ store, now = () => new Date(), readSource = null, hooks = {}, workerId = null }) {
  const self = workerId || `${process.pid}:${randomBytes(4).toString("hex")}`;
  const clock = () => iso(typeof now === "function" ? now() : now);

  async function requireGrant(token, nowIso, roles) {
    if (typeof token !== "string" || token.length < 16) {
      throw new WatchError("unauthorized", "invalid grant", 401);
    }
    const grant = await store.findGrant(hashGrantToken(token), nowIso);
    if (!grant) throw new WatchError("unauthorized", "invalid grant", 401);
    if (roles && !roles.includes(grant.role)) throw new WatchError("forbidden", "insufficient scope", 403);
    assertOwnerId(grant.projectId);
    return grant;
  }

  async function save(watch, expectedVersion) {
    watch.costs.storageBytes = await store.storageBytes();
    const saved = await store.compareAndSave(watch, expectedVersion);
    if (!saved.ok) throw new WatchError("conflict", "watch changed before it could be saved", 409);
    return saved.watch;
  }

  async function control(token, taskId, action) {
    const nowIso = clock();
    const grant = await requireGrant(token, nowIso, ["owner", "writer"]);
    const watch = await store.getWatch(grant.projectId, taskId);
    if (!watch) throw new WatchError("not_found", "watch not found", 404);
    const { api, memory } = await openMonitor(watch, nowIso, "accepted", { posts: 0 });
    let outcome;
    try {
      outcome = action === "pause"
        ? await api.pause(watch.subscriptionId)
        : action === "resume"
          ? await api.resume(watch.subscriptionId)
          : await api.cancel(watch.subscriptionId);
    } catch (error) {
      throw asWatchError(error);
    }
    watch.monitorState = await memory.read();
    if (outcome.outcome === "expired" || outcome.subscription?.status === "expired") watch.status = "expired";
    else if (action === "pause") watch.status = "paused";
    else if (action === "resume") {
      watch.status = "scheduled";
      if (Date.parse(watch.nextDueAt) < Date.parse(nowIso)) watch.nextDueAt = nowIso;
    } else {
      watch.status = "cancelled";
      watch.cancelRequested = true;
      watch.lease = null;
      watch.pending = null;
    }
    watch.updatedAt = nowIso;
    return publicWatch(await save(watch, watch.version));
  }

  async function classify(watch, nowIso, deliveryMode) {
    const started = performance.now();
    const counter = { posts: 0 };
    const { api, memory } = await openMonitor(watch, nowIso, deliveryMode, counter);
    const pending = watch.pending;
    let observed;
    try {
      observed = pending.failure
        ? await api.observe({ subscriptionId: watch.subscriptionId, sourceFailure: pending.failure })
        : await api.observe({ subscriptionId: watch.subscriptionId, document: pending.document });
    } catch (error) {
      observed = {
        admitted: false,
        outcome: "malformed",
        evidenceClass: "incomparable",
        eventId: null,
        failureCode: error?.code || "malformed",
      };
    }
    let delivery = null;
    if (observed.eventId && observed.admitted) {
      const rows = await api.deliver({ subscriptionId: watch.subscriptionId });
      delivery = rows[0] || null;
    } else if (observed.eventId) {
      const state = await memory.read();
      delivery = state.deliveries[observed.eventId] || null;
    }
    watch.monitorState = await memory.read();
    const evidence = observed.evidenceId ? watch.monitorState.evidence?.[observed.evidenceId] : null;
    const capture = evidence?.nonSemantic?.capture || pending.document?.capture || null;
    const outcome = observed.outcome;
    const usefulChange = (outcome === "content_changed" || outcome === "service_restored") && capture !== "seeded";
    const subscription = watch.monitorState.subscriptions?.[watch.subscriptionId];
    watch.baselineDigest = subscription?.baseline?.materialDigest || watch.baselineDigest || null;
    watch.costs.deliveryPosts += counter.posts;
    if (delivery?.state === "unknown" || delivery?.outcome === "unknown") watch.costs.unknownDeliveries += 1;
    const row = emptyResult({
      operationId: pending.operationId,
      at: nowIso,
      outcome,
      evidenceClass: observed.evidenceClass || evidence?.evidenceClass || null,
      failureCode: observed.failureCode || evidence?.failureCode || null,
      usefulChange,
      usefulNegative: outcome === "unchanged",
      delivered: delivery?.delivered === true,
      deliveryState: delivery?.state || null,
      capture,
      publicSourceChanged: capture === "live" && pending.document?.publicSourceChanged === true && usefulChange,
      sourceCalls: pending.bytes == null ? 0 : 1,
      sourceBytes: pending.bytes || 0,
      runtimeMs: Math.round(performance.now() - started),
    });
    watch.results = trimResults([...(watch.results || []), row]);
    watch.costs.runtimeMs += row.runtimeMs;
    const cancelled = watch.cancelRequested || watch.status === "cancelled";
    const expired = Date.parse(watch.expiresAt) <= Date.parse(nowIso);
    if (cancelled) watch.status = "cancelled";
    else if (expired) watch.status = "expired";
    else watch.status = "scheduled";
    watch.nextDueAt = watch.status === "scheduled" ? plusMs(nowIso, watch.cadenceMs) : watch.expiresAt;
    watch.lease = null;
    watch.pending = null;
    watch.updatedAt = nowIso;
    return row;
  }

  async function recover(nowIso, deliveryMode) {
    const running = await store.listRunning();
    const rows = [];
    for (const watch of running) {
      const alive = pidAlive(watch.lease?.pid);
      const mine = watch.lease?.workerId === self;
      if (alive && !mine) continue;
      if (watch.pending?.phase === "fetched" && (watch.pending.document || watch.pending.failure)) {
        const row = await classify(watch, nowIso, deliveryMode);
        rows.push(await save(watch, watch.version));
        void row;
        continue;
      }
      watch.results = trimResults([...(watch.results || []), emptyResult({
        operationId: watch.pending?.operationId || watch.lease?.operationId || null,
        at: nowIso,
        outcome: "unknown",
        failureCode: "lost_reply_no_body",
        deliveryState: "unknown",
      })]);
      watch.costs.unknownDeliveries += 1;
      watch.pending = null;
      watch.lease = null;
      watch.status = watch.cancelRequested ? "cancelled" : "scheduled";
      watch.nextDueAt = watch.status === "scheduled" ? plusMs(nowIso, watch.cadenceMs) : watch.expiresAt;
      watch.updatedAt = nowIso;
      rows.push(await save(watch, watch.version));
    }
    return rows;
  }

  return {
    workerId: self,
    async enroll({ token, body }) {
      const nowIso = clock();
      const grant = await requireGrant(token, nowIso, ["owner", "writer"]);
      let spec;
      try {
        spec = normalizeEnrollment(body, nowIso);
      } catch (error) {
        throw error instanceof WatchError ? error : asWatchError(error);
      }
      const existing = await store.getWatch(grant.projectId, spec.taskId);
      if (existing) throw new WatchError("enrollment_conflict", "enrollment conflicts; the existing operation was not replaced", 409);
      const { monitor } = await loadPinnedMonitor();
      const memory = monitor.createMemoryStore();
      const counter = { posts: 0 };
      const api = monitor.createMonitor({
        store: memory,
        clock: monitor.frozenClock(nowIso),
        receivers: { "retained-pull": { kind: "injected", async send() { return { outcome: "accepted", httpStatus: 200, error: null }; } } },
      });
      const subscriptionId = `w-${spec.taskId}`;
      try {
        await api.subscribe({
          subscriptionId,
          owner: grant.projectId,
          source: spec.source,
          comparison: spec.materialFields
            ? { policy: "material-fields", materialFields: spec.materialFields }
            : { policy: "material-fields" },
          destination: { receiverId: "retained-pull" },
          budget: { maxUsefulEvents: spec.budget.maxUsefulEvents },
          expiresAt: spec.expiresAt,
        });
      } catch (error) {
        throw asWatchError(error);
      }
      void counter;
      const watch = {
        schema: "sds.managed-watch.enrollment.v1",
        version: 1,
        projectId: grant.projectId,
        grantId: grant.id,
        taskId: spec.taskId,
        subscriptionId,
        status: "scheduled",
        predicate: spec.predicate,
        source: spec.source,
        cadenceMs: spec.cadenceMs,
        expiresAt: spec.expiresAt,
        nextDueAt: nowIso,
        budget: spec.budget,
        budgetSource: spec.budgetSource,
        baselineDigest: null,
        results: [],
        costs: blankCosts(),
        lease: null,
        pending: null,
        cancelRequested: false,
        monitorState: await memory.read(),
        createdAt: nowIso,
        updatedAt: nowIso,
        paidServiceLaunch: false,
        subscriptionOffered: false,
      };
      const inserted = await store.insertWatch(watch);
      if (!inserted.ok) throw new WatchError("enrollment_conflict", "enrollment conflicts; the existing operation was not replaced", 409);
      watch.costs.storageBytes = await store.storageBytes();
      return publicWatch(watch);
    },

    async retrieve({ token, taskId }) {
      const nowIso = clock();
      const grant = await requireGrant(token, nowIso, ["owner", "writer", "reader"]);
      const watch = await store.getWatch(grant.projectId, taskId);
      if (!watch) throw new WatchError("not_found", "watch not found", 404);
      return publicWatch(watch);
    },

    async pause({ token, taskId }) {
      return control(token, taskId, "pause");
    },

    async resume({ token, taskId }) {
      return control(token, taskId, "resume");
    },

    async cancel({ token, taskId }) {
      return control(token, taskId, "cancel");
    },

    async runDue({ projectId = null, deliveryMode = "accepted", readSource: readOverride = null } = {}) {
      const nowIso = clock();
      await recover(nowIso, deliveryMode);
      const claimed = await store.claimDue({
        nowIso,
        workerId: self,
        projectId,
        leaseMs: DEFAULTS.leaseMs,
      });
      if (!claimed) return { action: "idle", read: false, results: [] };
      if (claimed.action !== "claimed") {
        return { action: claimed.action, read: false, watch: publicWatch(claimed.watch), results: claimed.watch.results.slice(-1) };
      }
      let watch = claimed.watch;
      if (hooks.beforeRead) await hooks.beforeRead(watch);
      const fresh = await store.getWatch(watch.projectId, watch.taskId);
      if (!fresh || fresh.status === "cancelled" || fresh.cancelRequested || fresh.lease?.operationId !== watch.lease.operationId) {
        if (fresh && fresh.lease?.operationId === watch.lease.operationId) {
          fresh.lease = null;
          fresh.pending = null;
          fresh.costs.operations = Math.max(0, fresh.costs.operations - 1);
          fresh.updatedAt = nowIso;
          await save(fresh, fresh.version);
        }
        return { action: "cancelled", read: false, watch: fresh ? publicWatch(fresh) : null, results: [] };
      }
      watch = fresh;
      const reader = readOverride || readSource || readPinnedSnapshot;
      const abort = AbortSignal.timeout(watch.budget.maxTimeMs);
      let read;
      try {
        read = await reader({
          watch,
          timeoutMs: watch.budget.maxTimeMs,
          maxBodyBytes: watch.budget.maxBodyBytes,
          now: nowIso,
          signal: abort,
        });
      } catch (error) {
        const calls = Number.isInteger(error?.calls) ? error.calls : 0;
        read = {
          failure: { code: error?.code || "source_unreachable", message: String(error?.message || "source failed").slice(0, 200) },
          bytes: 0,
          calls,
        };
      }
      const bytes = Number(read?.bytes) || 0;
      if (bytes > watch.budget.maxBodyBytes && read?.document) {
        read = { failure: { code: "body_limit", message: "source body exceeded the check budget" }, bytes, calls: read.calls ?? 1 };
      }
      watch.pending = {
        operationId: watch.lease.operationId,
        phase: "fetched",
        document: read?.document || null,
        failure: read?.failure || (read?.document ? null : { code: "malformed", message: "source document missing" }),
        bytes,
      };
      watch.costs.sourceCalls += Number.isInteger(read?.calls) ? read.calls : 1;
      watch.costs.sourceBytes += bytes;
      watch.updatedAt = nowIso;
      watch = await save(watch, watch.version);
      if (hooks.afterFetched) await hooks.afterFetched(watch);
      const row = await classify(watch, nowIso, deliveryMode);
      watch = await save(watch, watch.version);
      return { action: "completed", read: true, watch: publicWatch(watch), results: [row] };
    },

    async runDueForGrant({ token, deliveryMode = "accepted" }) {
      const nowIso = clock();
      const grant = await requireGrant(token, nowIso, ["owner", "writer"]);
      return this.runDue({ projectId: grant.projectId, deliveryMode });
    },

    async nextDueAt() {
      return store.nextDueAt(null);
    },
  };
}
