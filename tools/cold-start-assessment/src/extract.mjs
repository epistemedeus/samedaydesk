import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function findRoot(extractDir, archiveRoot, entry) {
  const preferred = join(extractDir, archiveRoot);
  if (existsSync(join(preferred, entry))) return preferred;
  const names = readdirSync(extractDir, { withFileTypes: true });
  for (const dirent of names) {
    if (!dirent.isDirectory()) continue;
    const candidate = join(extractDir, dirent.name);
    if (existsSync(join(candidate, entry))) return candidate;
  }
  if (existsSync(join(extractDir, entry))) return extractDir;
  return preferred;
}

export function extractArchive({ archivePath, extractDir, archiveRoot, entry }) {
  mkdirSync(extractDir, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", archivePath, "-C", extractDir], {
    encoding: "utf8",
  });
  if (tar.status !== 0) {
    return {
      ok: false,
      extractRoot: null,
      code: "extract_failed",
      message: tar.stderr || "tar failed",
    };
  }
  const extractRoot = findRoot(extractDir, archiveRoot, entry);
  if (!existsSync(join(extractRoot, entry))) {
    return {
      ok: false,
      extractRoot,
      code: "missing_entry",
      message: `extracted tree is missing ${entry}`,
    };
  }
  return { ok: true, extractRoot, code: "extracted" };
}
