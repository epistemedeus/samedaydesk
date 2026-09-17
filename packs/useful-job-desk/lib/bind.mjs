import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { findRepoRoot, PIN } from "./paths.mjs";
import { sha256Buffer, sha256File, sha256Tree } from "./hash.mjs";

function refuse(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.extra = extra;
  throw err;
}

export function bindEngine({ repoRoot, archivePath } = {}) {
  const root = findRepoRoot({ repoRoot });
  const archive = archivePath
    ? archivePath
    : join(root, PIN.engine.archivePath);
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
    const kitSha = sha256File(kitArchive);
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
      refuse("sidecar-mismatch", "committed sha256 sidecar does not match pack pin", {
        sidecar: pin,
      });
    }
  }

  const extractRoot = join(
    tmpdir(),
    `useful-job-desk-${PIN.engine.sha256.slice(0, 16)}-${process.pid}`,
  );
  const kitRoot = join(extractRoot, PIN.engine.rootName);
  const cli = join(kitRoot, PIN.engine.cli);
  const enginesDir = join(kitRoot, "engines");
  const catalogPath = join(kitRoot, "catalog.json");
  const kitReady = () => existsSync(cli) && existsSync(enginesDir) && existsSync(catalogPath);
  if (!kitReady()) {
    if (existsSync(extractRoot)) rmSync(extractRoot, { recursive: true, force: true });
    mkdirSync(extractRoot, { recursive: true });
    const tar = spawnSync("tar", ["-xzf", archive, "-C", extractRoot], {
      encoding: "utf8",
    });
    if (tar.status !== 0) {
      refuse("extract-failed", tar.stderr || "tar extract failed");
    }
  }
  if (!kitReady()) {
    refuse("cli-missing", `extracted 1.4.7 is missing ${PIN.engine.cli} or engines/`);
  }

  const enginesTree = sha256Tree(enginesDir);
  if (
    PIN.engine.enginesTreeSha256 &&
    (enginesTree.sha256 !== PIN.engine.enginesTreeSha256 ||
      enginesTree.fileCount !== PIN.engine.enginesFileCount)
  ) {
    refuse("engines-rewritten", "extracted engines/ tree does not match the 1.4.7 pin", {
      observedSha256: enginesTree.sha256,
      expectedSha256: PIN.engine.enginesTreeSha256,
      observedFileCount: enginesTree.fileCount,
      expectedFileCount: PIN.engine.enginesFileCount,
    });
  }

  return {
    repoRoot: root,
    archive,
    sha256: sha,
    bytes: buf.length,
    version: PIN.engine.version,
    kitRoot,
    cli,
    enginesDir,
    catalogPath,
    kitMatches,
    enginesTreeSha256: enginesTree.sha256,
    enginesFileCount: enginesTree.fileCount,
    purchaseAuthority: false,
    hostedAcquisition: false,
  };
}
