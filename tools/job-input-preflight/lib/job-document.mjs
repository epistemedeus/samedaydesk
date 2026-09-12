/**
 * Freeze page-document sibling captures at prepare.
 * Trusted local filesystem: bound to the job document directory, follow
 * a symlink once, refuse escape. Not a multi-tenant sandbox.
 */
import fs from "node:fs";
import path from "node:path";
import { sha256Buffer } from "./digest.mjs";
import { assertExecutionInputBytes, readBoundedRegularFile } from "./paths.mjs";
import { refuse } from "./refuse.mjs";
import { writeStagedBytes } from "./stage.mjs";

const CAPTURE_KEYS = Object.freeze(["before", "after"]);

export function isJobDocumentKey(key) {
  return key === "job";
}

export function captureInputKey(slot) {
  return `job-${slot}`;
}

function jobDirectory(jobPath) {
  return path.dirname(path.resolve(jobPath));
}

function assertBoundedCapture(absPath, jobDir) {
  let st;
  try {
    st = fs.lstatSync(absPath);
  } catch {
    throw refuse("input-missing-file", "Job document capture file not found", { path: absPath });
  }
  let target = absPath;
  if (st.isSymbolicLink()) {
    try {
      target = fs.realpathSync(absPath);
    } catch {
      throw refuse("input-missing-file", "Job document capture symlink is dangling", { path: absPath });
    }
    st = fs.statSync(target);
  }
  if (!st.isFile()) {
    throw refuse("input-not-regular-file", "Job document capture must be a regular file", { path: absPath });
  }
  const realJobDir = fs.realpathSync(jobDir);
  let realTarget;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    realTarget = path.resolve(target);
  }
  if (realTarget !== realJobDir && !realTarget.startsWith(`${realJobDir}${path.sep}`)) {
    throw refuse("input-path-escapes-root", "Job document capture escapes the job directory", {
      path: absPath,
      root: realJobDir,
    });
  }
  return target;
}

export function referencedCapturesFromJob(jobItem) {
  if (!jobItem || jobItem.kind !== "file" || !jobItem.buffer) return [];
  let spec;
  try {
    spec = JSON.parse(jobItem.buffer.toString("utf8"));
  } catch {
    return [];
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return [];
  const jobPath = jobItem.path ? path.resolve(jobItem.path) : null;
  const jobDir = jobPath ? jobDirectory(jobPath) : null;
  const out = [];
  for (const slot of CAPTURE_KEYS) {
    const rel = spec[slot];
    if (typeof rel !== "string" || rel === "" || /^https?:\/\//i.test(rel)) continue;
    if (!jobDir) {
      throw refuse(
        "input-malformed",
        "Job document captures require a filesystem job path so siblings can be frozen",
        { key: slot },
      );
    }
    const declared = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(jobDir, rel);
    const bounded = assertBoundedCapture(declared, jobDir);
    const actual = readBoundedRegularFile(bounded, { inputRoot: jobDir });
    out.push({
      key: captureInputKey(slot),
      slot,
      kind: "file",
      path: actual.path,
      relative: rel,
      inline: false,
      buffer: actual.buffer,
      text: actual.buffer.toString("utf8"),
      bytes: actual.bytes,
      sha256: actual.sha256,
    });
  }
  return out;
}

export function stageJobDocumentCaptures(jobItem, stagedDir) {
  const captures = referencedCapturesFromJob(jobItem);
  for (const item of captures) {
    assertExecutionInputBytes(item.key, item.bytes, { path: item.path });
    item.stagedPath = writeStagedBytes(stagedDir, {
      ...item,
      path: `${item.key}.json`,
    });
  }
  return captures;
}

export function captureFileBytes(captures) {
  const fileBytes = {};
  for (const item of captures || []) {
    if (!item?.buffer) continue;
    fileBytes[item.key] = item.buffer;
    if (item.slot) fileBytes[`job:${item.slot}`] = item.buffer;
  }
  return fileBytes;
}

export function digestNamed(buffer) {
  return sha256Buffer(buffer);
}
