import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PIN, SKILL_PATH, findRepoRoot } from "./paths.mjs";

function refuse(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.extra = extra;
  throw err;
}

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function bindEngine({ repoRoot, archivePath, extractRoot } = {}) {
  const root = findRepoRoot({ repoRoot });
  const archive = archivePath || join(root, PIN.engine.archivePath);
  if (!existsSync(archive)) {
    refuse("archive-not-found", `published archive missing: ${archive}`);
  }
  const buf = readFileSync(archive);
  const sha = sha256Buffer(buf);
  if (buf.length !== PIN.engine.bytes) {
    refuse("wrong-size", "published archive size does not match 1.4.7 pin", {
      observedBytes: buf.length,
      expectedBytes: PIN.engine.bytes,
    });
  }
  if (sha !== PIN.engine.sha256) {
    refuse("wrong-digest", "published archive sha256 does not match 1.4.7 pin", {
      observedSha256: sha,
      expectedSha256: PIN.engine.sha256,
    });
  }

  const kitArchive = join(root, PIN.engine.kitPath);
  let kitMatches = null;
  if (existsSync(kitArchive)) {
    const kitSha = sha256Buffer(readFileSync(kitArchive));
    kitMatches = kitSha === sha;
    if (!kitMatches) {
      refuse("kit-mismatch", "kit copy sha256 does not match the public 1.4.7 archive", {
        publicSha256: sha,
        kitSha256: kitSha,
      });
    }
  }

  const sidecar = join(root, PIN.engine.sidecarPath);
  if (existsSync(sidecar)) {
    const pin = JSON.parse(readFileSync(sidecar, "utf8"));
    if (pin.sha256 !== PIN.engine.sha256 || pin.bytes !== PIN.engine.bytes) {
      refuse("sidecar-mismatch", "committed sha256 sidecar does not match pack pin", { sidecar: pin });
    }
  }

  const dest = extractRoot || mkdtempSync(join(tmpdir(), "useful-jobs-skill-"));
  const kitRoot = join(dest, PIN.engine.rootName);
  const cli = join(kitRoot, PIN.engine.cli);
  const catalogPath = join(kitRoot, "catalog.json");
  if (!existsSync(cli) || !existsSync(catalogPath)) {
    const tar = spawnSync("tar", ["-xzf", archive, "-C", dest], { encoding: "utf8" });
    if (tar.status !== 0) {
      rmSync(dest, { recursive: true, force: true });
      refuse("extract-failed", tar.stderr || "tar extract failed");
    }
  }
  if (!existsSync(cli) || !existsSync(catalogPath)) {
    refuse("cli-missing", `extracted 1.4.7 is missing ${PIN.engine.cli}`);
  }

  return {
    repoRoot: root,
    archive,
    sha256: sha,
    bytes: buf.length,
    version: PIN.engine.version,
    kitRoot,
    cli,
    catalogPath,
    extractRoot: dest,
    kitMatches,
    purchaseAuthority: false,
    hostedAcquisition: false,
  };
}

export function overlaySkill(kitRoot, skillPath = SKILL_PATH) {
  const dest = join(kitRoot, "SKILL.md");
  copyFileSync(skillPath, dest);
  return dest;
}
