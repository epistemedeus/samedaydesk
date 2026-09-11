import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { INVENTORY_PATH } from "./paths.mjs";

/** Hardcoded pins. Inventory may overlay; these SHAs remain the fallback. */
export const EXPECTED_SHAS = Object.freeze({
  "sds52-paid-useful-jobs": "aeef964fa188443078958d9d6d393afae1d542ee",
  "w4-json-schema-webhook-drift": "94c7bfdfeaa99f5e70f341504df3051cc7717f91",
  "w4-lockfile-pin-delta": "e81efc8ab71b1bde88eca743d297149e61bbb6f2",
  "w4-route-table-diff": "7387eb677abd442dfab9081cb0ad95451fd2a762",
  "w4-page-change-offline-job": "91b57334818ecd7940cb854e9864f3b1749d1d1d",
});

export const SHA_RE = /^[0-9a-f]{40}$/i;

export const FALLBACK_PINS = Object.freeze([
  Object.freeze({
    id: "sds52-paid-useful-jobs",
    aliases: Object.freeze([
      "sds52",
      "sds52-wrapper",
      "sds52-api-upgrade-brief",
      "api-upgrade-brief",
    ]),
    family: "sds52",
    sha: EXPECTED_SHAS["sds52-paid-useful-jobs"],
    worktree: "/tmp/w5-h04/ro-sds52",
    cliRel: "server/paid-useful-jobs/bin/cli.mjs",
    helpArgs: Object.freeze(["--help"]),
    exampleArgs: Object.freeze(["run", "vendor-budget-impact", "--example"]),
    extraSmoke: Object.freeze([
      Object.freeze({ id: "list", args: Object.freeze(["list"]), needsOutDir: false }),
    ]),
    timeoutMs: 120_000,
    sampleLabeled: true,
  }),
  Object.freeze({
    id: "w4-json-schema-webhook-drift",
    aliases: Object.freeze(["w4-schema", "json-schema-webhook-drift"]),
    family: "schema-webhook",
    sha: EXPECTED_SHAS["w4-json-schema-webhook-drift"],
    worktree: "/tmp/w5-h04/ro-w4-schema",
    cliRel: "tools/json-schema-webhook-drift/bin/webhook-drift.mjs",
    helpArgs: Object.freeze(["--help"]),
    exampleArgs: Object.freeze(["--example"]),
    extraSmoke: Object.freeze([]),
    timeoutMs: 60_000,
    sampleLabeled: true,
  }),
  Object.freeze({
    id: "w4-lockfile-pin-delta",
    aliases: Object.freeze(["w4-lockfile", "lockfile-pin-delta"]),
    family: "lockfile",
    sha: EXPECTED_SHAS["w4-lockfile-pin-delta"],
    worktree: "/tmp/w5-h04/ro-w4-lockfile",
    cliRel: "tools/lockfile-pin-delta/bin/lockfile-delta.mjs",
    helpArgs: Object.freeze(["--help"]),
    exampleArgs: Object.freeze(["--example"]),
    extraSmoke: Object.freeze([]),
    timeoutMs: 60_000,
    sampleLabeled: true,
  }),
  Object.freeze({
    id: "w4-route-table-diff",
    aliases: Object.freeze(["w4-routes", "route-table-diff"]),
    family: "api-routes",
    sha: EXPECTED_SHAS["w4-route-table-diff"],
    worktree: "/tmp/w5-h04/ro-w4-routes",
    cliRel: "tools/route-table-diff/bin/route-diff.mjs",
    helpArgs: Object.freeze(["--help"]),
    exampleArgs: Object.freeze(["--example"]),
    extraSmoke: Object.freeze([]),
    timeoutMs: 60_000,
    sampleLabeled: true,
  }),
  Object.freeze({
    id: "w4-page-change-offline-job",
    aliases: Object.freeze(["w4-pages", "page-change-offline-job"]),
    family: "page-facts",
    sha: EXPECTED_SHAS["w4-page-change-offline-job"],
    worktree: "/tmp/w5-h04/ro-w4-pages",
    cliRel: "tools/page-change-offline-job/bin/page-change.mjs",
    helpArgs: Object.freeze(["--help"]),
    exampleArgs: Object.freeze(["--example"]),
    extraSmoke: Object.freeze([
      Object.freeze({ id: "journey", args: Object.freeze(["journey"]), needsOutDir: true }),
    ]),
    timeoutMs: 60_000,
    sampleLabeled: true,
    exampleNote: "--example is refused (SAMPLE is not a delivered watch); journey is the fixture path",
  }),
]);

const WORKTREE_KEY_TO_PIN = Object.freeze({
  sds52: "sds52-paid-useful-jobs",
  "w4-schema": "w4-json-schema-webhook-drift",
  "w4-lockfile": "w4-lockfile-pin-delta",
  "w4-routes": "w4-route-table-diff",
  "w4-pages": "w4-page-change-offline-job",
});

const INVENTORY_ID_TO_PIN = Object.freeze({
  "sds52-wrapper": "sds52-paid-useful-jobs",
  "sds52-paid-useful-jobs": "sds52-paid-useful-jobs",
  "sds52-api-upgrade-brief": "sds52-paid-useful-jobs",
  "api-upgrade-brief": "sds52-paid-useful-jobs",
  "vendor-budget-impact": "sds52-paid-useful-jobs",
  "feed-agenda": "sds52-paid-useful-jobs",
  "evidence-ci-annotation": "sds52-paid-useful-jobs",
  "listing-repair-packet": "sds52-paid-useful-jobs",
  "repeat-job-record": "sds52-paid-useful-jobs",
  "json-schema-webhook-drift": "w4-json-schema-webhook-drift",
  "w4-json-schema-webhook-drift": "w4-json-schema-webhook-drift",
  "lockfile-pin-delta": "w4-lockfile-pin-delta",
  "w4-lockfile-pin-delta": "w4-lockfile-pin-delta",
  "route-table-diff": "w4-route-table-diff",
  "w4-route-table-diff": "w4-route-table-diff",
  "page-change-offline-job": "w4-page-change-offline-job",
  "w4-page-change-offline-job": "w4-page-change-offline-job",
});

function clonePin(pin) {
  return {
    ...pin,
    aliases: [...(pin.aliases || [])],
    helpArgs: [...(pin.helpArgs || ["--help"])],
    exampleArgs: [...(pin.exampleArgs || ["--example"])],
    extraSmoke: (pin.extraSmoke || []).map((p) => ({
      ...p,
      args: [...(p.args || [])],
    })),
  };
}

function extractCliRel(item, worktree) {
  const fileish = [item.cliRel, item.bin];
  for (const c of fileish) {
    if (typeof c === "string" && c.endsWith(".mjs") && !c.includes(" ")) {
      return c.replace(/^\.\//, "");
    }
  }
  const blobs = [item.cliRelFromWorktree, item.cli, item.engineInvocation];
  for (const blob of blobs) {
    if (typeof blob !== "string") continue;
    const match = blob.match(/(?:^|\s)((?:[\w./-]+)\.mjs)\b/);
    if (!match) continue;
    let rel = match[1];
    if (worktree && rel.startsWith(worktree)) {
      rel = rel.slice(worktree.length).replace(/^\/+/, "");
    }
    if (rel.startsWith("/")) continue;
    return rel;
  }
  return "";
}

function inventoryItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.engines)) return raw.engines;
  if (Array.isArray(raw.pins)) return raw.pins;
  return [];
}

function findPin(engines, id) {
  if (!id) return null;
  const mapped = INVENTORY_ID_TO_PIN[id] || id;
  return (
    engines.find((e) => e.id === mapped || e.id === id || (e.aliases || []).includes(id)) ||
    null
  );
}

function overlayPin(target, item) {
  const sha = item.sha || item.head || item.commit || item.pin;
  if (typeof sha === "string" && SHA_RE.test(sha)) target.sha = sha.toLowerCase();
  const worktree = item.worktree || item.worktreePath || item.path || item.root || item.cwd;
  if (typeof worktree === "string" && worktree && !worktree.includes(" ")) {
    target.worktree = worktree;
  }
  const cliRel = extractCliRel(item, target.worktree);
  if (cliRel) target.cliRel = cliRel;
  if (Number.isFinite(item.timeoutMs)) target.timeoutMs = item.timeoutMs;
  if (Array.isArray(item.helpArgs)) target.helpArgs = [...item.helpArgs];
  if (Array.isArray(item.exampleArgs)) target.exampleArgs = [...item.exampleArgs];
  const alias = item.id || item.engineId;
  const sds52Jobs = new Set(Object.keys(INVENTORY_ID_TO_PIN).filter((k) => INVENTORY_ID_TO_PIN[k] === "sds52-paid-useful-jobs"));
  if (
    alias &&
    alias !== target.id &&
    !sds52Jobs.has(alias) &&
    !(target.aliases || []).includes(alias)
  ) {
    target.aliases = [...(target.aliases || []), alias];
  }
}

function looksLikeRunnableEngine(item) {
  const cliRel = extractCliRel(item, item.worktree || item.worktreePath || "");
  return Boolean(cliRel && cliRel.endsWith(".mjs"));
}

function normalizeInventoryPin(item) {
  const id = item.id || item.engineId;
  if (!id) return null;
  const sha = item.sha || item.head || item.commit || item.pin;
  const worktree = item.worktree || item.worktreePath || item.path || item.root || item.cwd || "";
  const cliRel = extractCliRel(item, worktree);
  if (!cliRel) return null;
  return {
    id,
    aliases: [...(item.aliases || [])],
    family: item.family || "unknown",
    sha: typeof sha === "string" && SHA_RE.test(sha) ? sha.toLowerCase() : "",
    worktree,
    cliRel,
    helpArgs: [...(item.helpArgs || ["--help"])],
    exampleArgs: [...(item.exampleArgs || ["--example"])],
    extraSmoke: (item.extraSmoke || []).map((p) => ({
      ...p,
      args: [...(p.args || [])],
    })),
    timeoutMs: Number.isFinite(item.timeoutMs) ? item.timeoutMs : 60_000,
    sampleLabeled: item.sampleLabeled !== false,
    fromInventory: true,
  };
}

export function loadEngines({ inventoryPath = INVENTORY_PATH } = {}) {
  const engines = FALLBACK_PINS.map(clonePin);
  let source = "fallback-pins";
  if (existsSync(inventoryPath)) {
    try {
      const raw = JSON.parse(readFileSync(inventoryPath, "utf8"));
      let overlaid = 0;
      if (raw.worktrees && typeof raw.worktrees === "object") {
        for (const [key, value] of Object.entries(raw.worktrees)) {
          const pin = findPin(engines, WORKTREE_KEY_TO_PIN[key] || key);
          if (pin && value && typeof value === "object") {
            overlayPin(pin, value);
            overlaid += 1;
          }
        }
      }
      if (raw.sds52WrapperShared && typeof raw.sds52WrapperShared === "object") {
        const pin = findPin(engines, "sds52-paid-useful-jobs");
        if (pin) {
          overlayPin(pin, raw.sds52WrapperShared);
          overlaid += 1;
        }
      }
      const items = inventoryItems(raw);
      for (const item of items) {
        const id = item.id || item.engineId;
        if (!id) continue;
        const existing = findPin(engines, id);
        if (existing) {
          overlayPin(existing, item);
          overlaid += 1;
          continue;
        }
        if (INVENTORY_ID_TO_PIN[id]) continue;
        if (!looksLikeRunnableEngine(item)) continue;
        const pin = normalizeInventoryPin(item);
        if (pin) engines.push(pin);
      }
      source = overlaid || items.length ? "inventory+fallback" : "fallback-pins (empty inventory)";
    } catch (err) {
      source = `fallback-pins (inventory unreadable: ${err.message})`;
    }
  }
  return { engines, source };
}

export function getEngine(id, engines) {
  const list = engines || loadEngines().engines;
  return (
    list.find((e) => e.id === id || (e.aliases || []).includes(id)) || null
  );
}

export function engineCliPath(engine) {
  return join(engine.worktree, engine.cliRel);
}

export function worktreeSha(worktree) {
  try {
    const r = spawnSync("git", ["-C", worktree, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    if (r.status === 0) return r.stdout.trim();
    return null;
  } catch {
    return null;
  }
}

export function describeEngine(engine) {
  const cli = engineCliPath(engine);
  const executedSha = existsSync(engine.worktree) ? worktreeSha(engine.worktree) : null;
  return {
    id: engine.id,
    aliases: engine.aliases || [],
    family: engine.family,
    sha: engine.sha,
    executedSha,
    worktree: engine.worktree,
    worktreeExists: existsSync(engine.worktree),
    cliRel: engine.cliRel,
    cliExists: existsSync(cli),
    timeoutMs: engine.timeoutMs,
  };
}
