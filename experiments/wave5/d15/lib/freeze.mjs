import { copyFileSync, cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { inspectSample } from "../../../../server/paid-useful-jobs/lib/sample-guard.mjs";
import { ensureUsefulJobsKit } from "../../../../server/paid-useful-jobs/lib/engine.mjs";
import { sha256File } from "../../../../server/paid-useful-jobs/lib/digest.mjs";

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hashTree(dir) {
  const rows = [];
  const stack = [{ rel: "", abs: dir }];
  while (stack.length) {
    const cur = stack.pop();
    const names = readdirSync(cur.abs).sort();
    for (const name of names) {
      const abs = join(cur.abs, name);
      const rel = cur.rel ? `${cur.rel}/${name}` : name;
      const st = statSync(abs);
      if (st.isDirectory()) stack.push({ rel, abs });
      else if (st.isFile()) rows.push({ rel, sha256: sha256File(abs), bytes: st.size });
    }
  }
  return rows;
}

export function freezeCallerInputs({ jobId, inputs, workDir }) {
  const kit = ensureUsefulJobsKit();
  const sample = inspectSample({ jobId, inputs }, { kitRoot: kit });
  const freezeRoot = join(workDir, "frozen");
  mkdirSync(freezeRoot, { recursive: true });
  const files = {};
  for (const [key, value] of Object.entries(inputs || {})) {
    if (typeof value !== "string" || value === "") continue;
    const livePath = value;
    const dest = join(freezeRoot, key === "input-root" ? key : `${key}${extOf(livePath)}`);
    if (key === "input-root" || isDirectory(livePath)) {
      mkdirSync(dest, { recursive: true });
      cpSync(livePath, dest, { recursive: true });
      files[key] = {
        key,
        kind: "directory",
        livePath,
        frozenPath: dest,
        sha256: null,
        tree: hashTree(dest),
      };
      continue;
    }
    copyFileSync(livePath, dest);
    const st = statSync(dest);
    files[key] = {
      key,
      kind: "file",
      livePath,
      frozenPath: dest,
      sha256: sha256File(dest),
      bytes: st.size,
    };
  }
  return { jobId, kit, sample, files, freezeRoot };
}

function extOf(path) {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}

export function liveFileSha(entry) {
  if (!entry || entry.kind !== "file") return null;
  try {
    return sha256File(entry.livePath);
  } catch {
    return null;
  }
}

export function liveDrift(snapshot) {
  const drifted = [];
  for (const entry of Object.values(snapshot.files)) {
    if (entry.kind === "directory") {
      const now = hashTree(entry.livePath);
      const before = JSON.stringify(entry.tree);
      const after = JSON.stringify(now);
      if (before !== after) drifted.push({ key: entry.key, kind: "directory" });
      continue;
    }
    const now = liveFileSha(entry);
    if (now !== entry.sha256) {
      drifted.push({
        key: entry.key,
        kind: "file",
        frozenSha256: entry.sha256,
        liveSha256: now,
      });
    }
  }
  return drifted;
}

export function executeInputs(snapshot, bind) {
  const out = {};
  for (const [key, entry] of Object.entries(snapshot.files)) {
    out[key] = bind === "live-observe" || bind === "verify-live" ? entry.livePath : entry.frozenPath;
  }
  return out;
}
