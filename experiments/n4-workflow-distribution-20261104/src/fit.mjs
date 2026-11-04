import { lstatSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { lookupCapabilityOwner } from "../../../server/lib/observatory/maintained-capability.js";
import { loadPins } from "./pins.mjs";

const CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SCHEMA = "n4.workflow-distribution.case.v1";
const MAX_BYTES = 1_000_000;

const PRIVATE_KEYS = new Set([
  "password",
  "secret",
  "apikey",
  "token",
  "authorization",
  "contentkey",
  "webhooksecret",
  "privatekey",
  "email",
  "staffpassword",
  "accesstoken",
]);

const LIVE_KEYS = ["fetch", "contentApi", "installDify", "installGhost"];

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[-_\s]/g, "");
}

export function findPrivateKey(value, path = "") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findPrivateKey(value[index], `${path}/${index}`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (PRIVATE_KEYS.has(normalizeKey(key))) return { key, path: next };
    const found = findPrivateKey(child, next);
    if (found) return found;
  }
  return null;
}

export function nativeDirectRoute() {
  return {
    executed: false,
    selected: true,
    argv: [
      "node",
      "tools/recurring-job-recipes/cli.mjs",
      "--recipe",
      "source-change-alert",
      "--prior",
      "<prior.json>",
      "--current-fixture",
      "<capture.json>",
      "--fields",
      "<fields>",
      "--schedule",
      "<schedule>",
      "--clock",
      "<ISO-UTC>",
      "--horizon",
      "<hours>",
    ],
    note: "Run the direct source-change-alert recipe yourself. This journey did not start it, and it did not start Dify or Ghost.",
  };
}

export function difyDirectRoute() {
  const pins = loadPins();
  return {
    executed: false,
    selected: true,
    argv: [
      "python3",
      "src/direct_csv.py",
      "--url",
      "<public-document-url>",
      "--fields",
      "<fields>",
      "--start-reader",
    ],
    note: `Direct checker from ${pins.dify.repository} at ${pins.dify.commit}. It does not start Dify. This journey did not run it.`,
  };
}

export function ghostDirectRoute() {
  const pins = loadPins();
  return {
    executed: false,
    selected: true,
    argv: ["node", "job/bin/demo.mjs"],
    note: `Offline demo from ${pins.ghost.repository} at ${pins.ghost.commit}. This is not install/native-install.sh. This journey did not run it.`,
  };
}

export function installDirectRoute() {
  return {
    executed: false,
    selected: true,
    argv: [
      "node",
      "experiments/n4-workflow-distribution-20261104/bin/workflow.mjs",
      "install",
      "--state",
      "<state-dir>",
      "--clock",
      "<ISO-UTC>",
    ],
    note: "Install this workflow state before run. Install does not start Dify or Ghost.",
  };
}

function unselected(note) {
  return { executed: false, selected: false, argv: null, note };
}

function noFit(reason, directRoute, extra = {}) {
  return { ok: false, reason, directRoute, executed: false, ...extra };
}

export function liveKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return LIVE_KEYS.filter((key) => Object.hasOwn(value, key));
}

function isClock(value) {
  return typeof value === "string" && CLOCK.test(value);
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value >= 1;
}

export function resolveCasePath(caseDir, value) {
  if (typeof value !== "string" || value.length === 0) return { ok: false, reason: "missing_input" };
  const absolute = isAbsolute(value) ? value : resolve(caseDir, value);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    return { ok: false, reason: "missing_input" };
  }
  if (stat.isSymbolicLink()) return { ok: false, reason: "symlink" };
  if (!stat.isFile() && !stat.isDirectory()) return { ok: false, reason: "missing_input" };
  if (stat.isFile() && stat.size > MAX_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, path: absolute, relative: relative(caseDir, absolute) };
}

export function assessCase(doc, caseDir) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return noFit("schema", nativeDirectRoute());
  }
  const privateKey = findPrivateKey(doc);
  if (privateKey) {
    return noFit("private_field", unselected(
      "A private field is present. It was not copied and nothing was run. Remove it and use your own command.",
    ), { privateKey: privateKey.key });
  }
  const live = liveKeys(doc);
  if (live.length > 1) {
    return noFit("mixed_live_request", unselected(
      "More than one live product was requested. This journey did not choose among them.",
    ));
  }
  if (live.length === 1) {
    const key = live[0];
    const route = key === "fetch" || key === "installDify"
      ? difyDirectRoute()
      : ghostDirectRoute();
    if (key === "installDify" || key === "installGhost") {
      route.note = `${route.note} The installer was not selected.`;
    }
    return noFit("live_request", route, { liveKey: key });
  }
  if (doc.schema !== SCHEMA) return noFit("schema", nativeDirectRoute());

  const owned = lookupCapabilityOwner(doc.jobId);
  if (!doc.jobId || owned.outcome !== "owned") {
    const reason = owned.reason || "unknown_need";
    return noFit(reason, unselected(
      `lookup returned ${reason}. No owned command was selected. Keep the command you already use for this id.`,
    ), { jobId: typeof doc.jobId === "string" ? doc.jobId : null });
  }

  if (doc.optIn === true && doc.optInWithdrawn === true) {
    return noFit("opt_in_conflict", nativeDirectRoute());
  }
  if (doc.optIn !== true && doc.optInWithdrawn !== true) {
    return noFit("opt_in_required", nativeDirectRoute());
  }
  if (!isClock(doc.clock) || !isPositiveInt(doc.sequence) || !isPositiveInt(doc.horizonHours)) {
    return noFit("incomplete", nativeDirectRoute());
  }
  if (typeof doc.taskId !== "string" || doc.taskId.length === 0 || typeof doc.subject !== "string" || doc.subject.length === 0) {
    return noFit("incomplete", nativeDirectRoute());
  }
  const source = doc.sourceChange;
  if (!source || typeof source !== "object" || Array.isArray(source)) return noFit("incomplete", nativeDirectRoute());
  if (!Array.isArray(source.fields) || source.fields.length === 0 || source.fields.some((field) => typeof field !== "string" || field.length === 0)) {
    return noFit("incomplete", nativeDirectRoute());
  }
  if (!Array.isArray(doc.readerFields) || doc.readerFields.length === 0) return noFit("incomplete", nativeDirectRoute());
  if (!Number.isInteger(doc.readerPage)) return noFit("incomplete", nativeDirectRoute());

  const required = [
    ["pageJob", doc.pageJob, "file"],
    ["beforeWork", doc.beforeWork, "file"],
    ["prior", source.prior, "file"],
    ["capture", source.capture, "file"],
    ["readerRecord", doc.readerRecord, "file"],
    ["ghostPosts", doc.ghostPosts, "file"],
  ];
  const paths = {};
  for (const [name, value] of required) {
    const resolved = resolveCasePath(caseDir, value);
    if (!resolved.ok) return noFit(resolved.reason, nativeDirectRoute());
    if (name !== "pageJob" && resolved.path && lstatSync(resolved.path).isDirectory()) {
      return noFit("missing_input", nativeDirectRoute());
    }
    paths[name] = resolved.path;
  }
  if (doc.savedDecision != null) {
    const saved = resolveCasePath(caseDir, doc.savedDecision);
    if (!saved.ok) return noFit(saved.reason, nativeDirectRoute());
    paths.savedDecision = saved.path;
  }

  return {
    ok: true,
    reason: null,
    directRoute: null,
    executed: false,
    owned,
    paths,
    caseDir,
  };
}
