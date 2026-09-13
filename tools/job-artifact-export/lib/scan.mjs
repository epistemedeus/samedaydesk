import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { FILE_MAX_BYTES, RESERVED_EXPORT_NAMES, sha256Hex } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

export function listExportFiles(inDir) {
  const stats = lstatSync(inDir);
  if (!stats.isDirectory()) {
    throw refuse("in-dir-not-directory", "--in-dir must be a directory");
  }
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isSymbolicLink() || lstatSync(abs).isSymbolicLink()) {
        throw refuse("symlink-refused", "in-dir contains a symlink; export refuses closed", { path: abs });
      }
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(inDir, abs).split(sep).join(posix.sep);
      if (rel === "" || rel.startsWith("..") || posix.isAbsolute(rel)) {
        throw refuse("path-escape", "refusing a path outside --in-dir", { path: rel });
      }
      files.push({ abs, path: rel, bytes: lstatSync(abs).size });
    }
  };
  walk(inDir);
  if (!files.length) {
    throw refuse("empty-in-dir", "--in-dir has no regular files to export");
  }
  for (const file of files) {
    if (file.bytes > FILE_MAX_BYTES) {
      throw refuse("file-over-size-cap", `file exceeds the 8MiB cap (${FILE_MAX_BYTES} bytes)`, {
        path: file.path,
        bytes: file.bytes,
        cap: FILE_MAX_BYTES,
      });
    }
    const base = posix.basename(file.path);
    if (RESERVED_EXPORT_NAMES.has(base) && posix.dirname(file.path) === ".") {
      throw refuse("reserved-name-collision", `in-dir already contains reserved export name ${base}`, {
        path: file.path,
      });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function readExportFile(abs) {
  return readFileSync(abs);
}

export function sha256File(abs) {
  return sha256Hex(readFileSync(abs));
}
