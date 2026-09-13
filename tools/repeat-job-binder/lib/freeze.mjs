import fs from "node:fs";
import path from "node:path";
import { sha256Buffer, sha256File } from "./digest.mjs";
import { refuse } from "./refuse.mjs";
import { prospectiveRealpath } from "../../output-replay-harness/lib/locations.mjs";

const SLOTS = ["before", "after", "used"];

const FIRST_RUN_OUTPUT_NAMES = Object.freeze([
  "repeat-job.json",
  "repeat-job.md",
  "upgrade-brief.json",
  "upgrade-brief.md",
  "budget-impact.json",
  "budget-impact.md",
  "record-repeat.json",
  "second-run.json",
  "second-run.md",
  "receipt.json",
]);

function realpathOrAbs(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return prospectiveRealpath(p);
  }
}

function pushFileRef(refs, kind, filePath) {
  if (!filePath) return;
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return;
  } catch {
    return;
  }
  const abs = realpathOrAbs(filePath);
  if (refs.some((r) => r.path === abs)) return;
  refs.push({
    kind,
    path: abs,
    sha256: sha256File(abs),
    bytes: fs.statSync(abs).size,
  });
}

export function collectPreviousOutputRefs(ticket) {
  const refs = [];
  pushFileRef(refs, "ticket", ticket.path);
  const dir = ticket.dir;
  for (const name of FIRST_RUN_OUTPUT_NAMES) {
    pushFileRef(refs, "first-run-output", path.join(dir, name));
    pushFileRef(refs, "first-run-output", path.join(dir, "engine", name));
  }
  return refs;
}

export function freezeCurrentInputs({ verifiedInputs, destDir }) {
  if (fs.existsSync(destDir) && (fs.lstatSync(destDir).isSymbolicLink() || fs.readdirSync(destDir).length)) {
    throw refuse('reused-output-path', 'Frozen input directory must be new or empty', { destDir });
  }
  fs.mkdirSync(destDir, { recursive: true });
  const frozen = {};
  for (const slot of SLOTS) {
    const v = verifiedInputs?.[slot];
    if (!v || v.state !== "verified" || !v.actual?.path) {
      frozen[slot] = null;
      continue;
    }
    const src = v.actual.path;
    const ext = path.extname(src) || "";
    const dest = path.join(destDir, `${slot}${ext}`);
    const buf = fs.readFileSync(src);
    if (v.actual.sha256 && sha256Buffer(buf) !== v.actual.sha256) {
      throw refuse("frozen-input-copy-mismatch", "Source bytes changed before freeze", {
        slot,
        path: src,
      });
    }
    fs.writeFileSync(dest, buf, { flag: 'wx', mode: 0o444 });
    fs.chmodSync(dest, 0o444);
    const sha256 = sha256File(dest);
    if (sha256 !== v.actual.sha256) {
      throw refuse("frozen-input-copy-mismatch", "Frozen copy digest does not match verified bytes", {
        slot,
        source: src,
        frozen: dest,
      });
    }
    frozen[slot] = {
      slot,
      sourcePath: realpathOrAbs(src),
      frozenPath: dest,
      sha256,
      bytes: buf.length,
    };
  }
  return frozen;
}

export function engineInputPaths(frozen, fallback = {}) {
  const out = {};
  for (const slot of SLOTS) {
    out[slot] = frozen?.[slot]?.frozenPath || fallback[slot] || null;
  }
  return out;
}

export function refusePreviousOutputReuse({ frozen, previousRefs }) {
  const prevBySha = new Map(previousRefs.map((r) => [r.sha256, r]));
  const prevByPath = new Set(previousRefs.map((r) => r.path));
  for (const slot of SLOTS) {
    const cur = frozen?.[slot];
    if (!cur) continue;
    if (prevByPath.has(cur.sourcePath)) {
      throw refuse(
        "previous-output-reused",
        "Current input path is a previous-run output; changed input is required, not prior output reused as new work",
        { slot, path: cur.sourcePath, previous: prevByPath.has(cur.sourcePath) ? "path" : null },
      );
    }
    const hit = prevBySha.get(cur.sha256);
    if (hit) {
      throw refuse(
        "previous-output-reused",
        "Current input bytes match a previous-run output; that artifact is not new work",
        { slot, sha256: cur.sha256, previousPath: hit.path, previousKind: hit.kind },
      );
    }
  }
}

export function refuseReusedOutDir({ outDir, ticket, sourcePaths = [] }) {
  const resolvedOut = realpathOrAbs(outDir);
  const ticketDir = ticket?.dir ? realpathOrAbs(ticket.dir) : null;
  const ticketPath = ticket?.path ? realpathOrAbs(ticket.path) : null;
  if (ticketDir && (resolvedOut === ticketDir || resolvedOut.startsWith(ticketDir + path.sep))) {
    throw refuse("reused-output-path", "Output directory reuses the first-run ticket directory", {
      outDir: resolvedOut,
      ticketDir,
    });
  }
  if (ticketPath && ticketPath.startsWith(`${resolvedOut}${path.sep}`)) {
    throw refuse("reused-output-path", "Output directory would contain the first-run ticket", {
      outDir: resolvedOut,
      ticketPath,
    });
  }
  for (const src of sourcePaths.filter(Boolean)) {
    const abs = realpathOrAbs(src);
    if (abs === resolvedOut || resolvedOut.startsWith(`${abs}${path.sep}`) || abs.startsWith(resolvedOut + path.sep)) {
      throw refuse("out-dir-collides-with-input", "Output directory collides with a source input path", {
        outDir: resolvedOut,
        source: abs,
      });
    }
  }
  if (fs.existsSync(resolvedOut) && (!fs.statSync(resolvedOut).isDirectory() || fs.readdirSync(resolvedOut).length)) {
    throw refuse('reused-output-path', 'Binder output directory must be new or empty', { outDir: resolvedOut });
  }
}

export function prepareEmptyEngineDir(outDir) {
  const engineDir = path.join(outDir, "engine");
  if (fs.existsSync(engineDir)) {
    const names = fs.readdirSync(engineDir);
    if (names.length > 0) {
      throw refuse(
        "reused-output-path",
        "Engine output directory already contains files; a reused path cannot bind this run's outputs",
        { engineDir, existing: names },
      );
    }
  }
  fs.mkdirSync(engineDir, { recursive: true });
  return engineDir;
}
