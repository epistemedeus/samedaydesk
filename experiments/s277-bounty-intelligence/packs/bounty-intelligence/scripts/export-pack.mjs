#!/usr/bin/env node
/**
 * Write PACK-EXPORT.patch — unified diff of this pack tree for transplant
 * into neomorphic-io packs/bounty-intelligence. Excludes node_modules.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(PACK_ROOT, "PACK-EXPORT.patch");

const INCLUDE = [
  "src",
  "tests",
  "fixtures",
  "bin",
  "docs",
  "contracts",
  "html",
  "receipts",
  "package.json",
  "README.md",
  "RESULT.md",
  "scripts",
  "SOURCE-NOTICE.txt",
];

const EXCLUDE_DIR_NAMES = new Set(["node_modules", ".git"]);
const EXCLUDE_BASENAMES = new Set(["PACK-EXPORT.patch"]);

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: "cat", PAGER: "cat" },
    ...opts,
  });
}

function gitRoot() {
  const r = run("git", ["rev-parse", "--show-toplevel"], { cwd: PACK_ROOT });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function posixRel(from, to) {
  return relative(from, to).replaceAll("\\", "/");
}

function isExcludedName(name) {
  return EXCLUDE_DIR_NAMES.has(name) || EXCLUDE_BASENAMES.has(name);
}

function listedFiles() {
  const out = [];
  function walk(rel) {
    const abs = join(PACK_ROOT, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    const base = rel.split("/").pop();
    if (isExcludedName(base)) return;
    if (st.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(base)) return;
      for (const name of readdirSync(abs).sort()) {
        if (isExcludedName(name)) continue;
        walk(rel ? `${rel}/${name}` : name);
      }
      return;
    }
    out.push(rel);
  }
  for (const item of INCLUDE) walk(item);
  return out;
}

function isIncludedRel(rel) {
  const norm = String(rel || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  if (!norm) return false;
  if (norm === "PACK-EXPORT.patch" || norm.endsWith("/PACK-EXPORT.patch")) return false;
  if (norm === "node_modules" || norm.startsWith("node_modules/") || norm.includes("/node_modules/")) {
    return false;
  }
  return INCLUDE.some((item) => norm === item || norm.startsWith(`${item}/`));
}

function stripToPackRel(path, packRelFromRepo) {
  let p = String(path || "").replaceAll("\\", "/");
  if (p.startsWith("a/")) p = p.slice(2);
  if (p.startsWith("b/")) p = p.slice(2);
  const absNoSlash = PACK_ROOT.replaceAll("\\", "/").replace(/^\//, "");
  if (p.startsWith(`${absNoSlash}/`)) p = p.slice(absNoSlash.length + 1);
  if (p.startsWith(`${PACK_ROOT}/`)) p = p.slice(PACK_ROOT.length + 1);
  if (packRelFromRepo && p.startsWith(`${packRelFromRepo}/`)) p = p.slice(packRelFromRepo.length + 1);
  return p.replace(/^\.\//, "");
}

function filterAndRewritePatch(patch, packRelFromRepo) {
  const parts = patch.split(/^diff --git /m);
  const keep = [];
  for (const part of parts.slice(1)) {
    const firstLine = part.split("\n", 1)[0];
    const m = firstLine.match(/\sb\/(.+?)\s*$/) || firstLine.match(/b\/(\S+)/);
    const raw = m ? m[1] : "";
    const rel = stripToPackRel(raw, packRelFromRepo);
    if (!isIncludedRel(rel)) continue;
    let body = `diff --git ${part}`;
    if (packRelFromRepo) {
      const prefix = packRelFromRepo.replace(/\/$/, "");
      body = body
        .replaceAll(`a/${prefix}/`, "a/")
        .replaceAll(`b/${prefix}/`, "b/")
        .replaceAll(`a/${prefix}`, "a")
        .replaceAll(`b/${prefix}`, "b");
    }
    const absNoSlash = PACK_ROOT.replaceAll("\\", "/").replace(/^\//, "");
    body = body
      .replaceAll(`a/${absNoSlash}/`, "a/")
      .replaceAll(`b/${absNoSlash}/`, "b/")
      .replaceAll(`a${PACK_ROOT}/`, "a/")
      .replaceAll(`b${PACK_ROOT}/`, "b/");
    keep.push(body);
  }
  return keep.join("");
}

function tryNoIndexDot() {
  const r = run("git", ["--no-pager", "diff", "--no-index", "--", "/dev/null", "."], {
    cwd: PACK_ROOT,
  });
  if ((r.status === 0 || r.status === 1) && r.stdout && r.stdout.includes("diff --git")) {
    return r.stdout;
  }
  return null;
}

function tryNoIndexPerFile(files) {
  const chunks = [];
  for (const rel of files) {
    const r = run("git", ["--no-pager", "diff", "--no-index", "--", "/dev/null", rel], {
      cwd: PACK_ROOT,
    });
    if (r.stdout && r.stdout.includes("diff --git")) {
      chunks.push(r.stdout.endsWith("\n") ? r.stdout : `${r.stdout}\n`);
      continue;
    }
    if (r.status !== 0 && r.status !== 1) {
      return { ok: false, error: (r.stderr || `git diff --no-index failed for ${rel}`).trim() };
    }
  }
  const text = chunks.join("");
  return text.includes("diff --git") ? { ok: true, text } : { ok: false, error: "empty per-file diff" };
}

function tryTarStageDiff(files) {
  const tmp = mkdtempSync(join(tmpdir(), "bounty-pack-export-"));
  try {
    const empty = join(tmp, "empty");
    const staged = join(tmp, "pack");
    mkdirSync(empty);
    mkdirSync(staged);
    const listing = files.join("\n") + "\n";
    writeFileSync(join(tmp, "listing.txt"), listing);
    const tar = join(tmp, "pack.tar");
    const tarArgs = ["-C", PACK_ROOT, "--exclude=node_modules", "--exclude=PACK-EXPORT.patch", "-cf", tar];
    const present = INCLUDE.filter((item) => existsSync(join(PACK_ROOT, item)));
    const packed = run("tar", [...tarArgs, ...present]);
    if (packed.status !== 0) {
      return { ok: false, error: (packed.stderr || "tar failed").trim() };
    }
    const extract = run("tar", ["-C", staged, "-xf", tar]);
    if (extract.status !== 0) {
      return { ok: false, error: (extract.stderr || "tar extract failed").trim() };
    }
    const diff = run("git", ["--no-pager", "diff", "--no-index", "--", empty, staged]);
    if ((diff.status === 0 || diff.status === 1) && diff.stdout && diff.stdout.includes("diff --git")) {
      const stagedPrefix = staged.replaceAll("\\", "/").replace(/^\//, "");
      const rewritten = diff.stdout
        .replaceAll(`a/${stagedPrefix}/`, "a/")
        .replaceAll(`b/${stagedPrefix}/`, "b/");
      return { ok: true, text: rewritten };
    }
    return { ok: false, error: (diff.stderr || "tar-stage git diff empty").trim() };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function tryIntentToAddDiff(files) {
  const root = gitRoot();
  if (!root) return { ok: false, error: "not a git work tree" };
  const packRel = posixRel(root, PACK_ROOT);
  const pathspecs = files.map((f) => `${packRel}/${f}`);
  const tmpDir = mkdtempSync(join(tmpdir(), "bounty-export-index-"));
  const tmpIndex = join(tmpDir, "index");
  const realIndex = join(root, ".git", "index");
  try {
    if (existsSync(realIndex)) writeFileSync(tmpIndex, readFileSync(realIndex));
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex, GIT_PAGER: "cat", PAGER: "cat" };
    const add = run("git", ["add", "-N", "--", ...pathspecs], { cwd: root, env });
    if (add.status === 0) {
      const diff = run("git", ["--no-pager", "diff", `--relative=${packRel}`, "--", ...pathspecs], {
        cwd: root,
        env,
      });
      if ((diff.status === 0 || diff.status === 1) && diff.stdout && diff.stdout.includes("diff --git")) {
        return { ok: true, text: diff.stdout, pathStyle: "pack-root-relative" };
      }
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  // Assignment fallback: intent-to-add in the real index, then restore.
  const add = run("git", ["add", "-N", "--", packRel], { cwd: root });
  if (add.status !== 0) {
    return { ok: false, error: (add.stderr || "git add -N failed").trim() };
  }
  const diff = run("git", ["--no-pager", "diff", `--relative=${packRel}`, "--", packRel], { cwd: root });
  run("git", ["reset", "-q", "--", packRel], { cwd: root });
  if ((diff.status === 0 || diff.status === 1) && diff.stdout && diff.stdout.includes("diff --git")) {
    return {
      ok: true,
      text: filterAndRewritePatch(diff.stdout, packRel) || diff.stdout,
      pathStyle: "pack-root-relative",
    };
  }
  return { ok: false, error: (diff.stderr || "git diff after add -N was empty").trim() };
}

function exportPatch() {
  const files = listedFiles();
  if (files.length === 0) {
    throw new Error("no pack files to export (src/tests/fixtures/bin/docs/contracts/html)");
  }

  const noIndexDot = tryNoIndexDot();
  if (noIndexDot) {
    const root = gitRoot();
    const packRel = root ? posixRel(root, PACK_ROOT) : "";
    const text = filterAndRewritePatch(noIndexDot, packRel) || noIndexDot;
    return { text, method: "git-diff-no-index-dot", pathStyle: inferPathStyle(text, packRel) };
  }

  const perFile = tryNoIndexPerFile(files);
  if (perFile.ok) {
    return { text: perFile.text, method: "git-diff-no-index-per-file", pathStyle: "pack-root-relative" };
  }

  const tarStage = tryTarStageDiff(files);
  if (tarStage.ok) {
    return { text: tarStage.text, method: "tar-stage-git-diff", pathStyle: inferPathStyle(tarStage.text, "") };
  }

  const intent = tryIntentToAddDiff(files);
  if (intent.ok) {
    return {
      text: intent.text,
      method: "git-add-N-workspace-diff",
      pathStyle: intent.pathStyle || inferPathStyle(intent.text, posixRel(gitRoot() || PACK_ROOT, PACK_ROOT)),
    };
  }

  throw new Error(
    `PACK-EXPORT.patch generation failed: no-index=${perFile.error || "dot failed"}; tar=${tarStage.error}; add-N=${intent.error}`
  );
}

function inferPathStyle(text, packRelFromRepo) {
  if (text.includes("diff --git a/src/") || text.includes("diff --git a/package.json")) {
    return "pack-root-relative";
  }
  if (packRelFromRepo && text.includes(`a/${packRelFromRepo}/`)) return "repo-relative";
  if (text.includes("experiments/s277-bounty-intelligence/packs/bounty-intelligence/")) {
    return "repo-relative";
  }
  return "unknown";
}

const { text, method, pathStyle } = exportPatch();
if (!text.includes("diff --git")) {
  throw new Error("generated patch has no unified diff hunks");
}
writeFileSync(OUT_PATH, text);
const buf = readFileSync(OUT_PATH);
const sha256 = createHash("sha256").update(buf).digest("hex");
const summary = {
  ok: true,
  path: OUT_PATH,
  bytes: buf.byteLength,
  sha256,
  method,
  pathStyle,
  includes: INCLUDE,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
