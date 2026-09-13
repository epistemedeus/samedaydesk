import { mkdirSync, readFileSync, renameSync, rmSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { ConsumerRefuse } from "./errors.mjs";
import { sha256Bytes } from "./digest-named.mjs";

export const UNSUPPORTED_PORTABLE_ACQUISITION = "unsupported-portable-acquisition";

function containedIn(root, candidate) {
  const base = resolve(root);
  const abs = resolve(candidate);
  return abs === base || abs.startsWith(`${base}${sep}`);
}

function assertArtifactName(name) {
  if (typeof name !== "string" || name === "") {
    throw new ConsumerRefuse("invalid-artifact-name", "artifact name is required");
  }
  if (name !== basename(name) || name === "." || name === ".." || name.includes("\0")) {
    throw new ConsumerRefuse("invalid-artifact-name", "artifact name must be a basename", { name });
  }
  return name;
}

export function portableAcquisitionUnsupported({ reason } = {}) {
  return {
    code: UNSUPPORTED_PORTABLE_ACQUISITION,
    httpArtifactsDelivered: false,
    source: null,
    files: [],
    reason:
      reason ||
      "GET /results/:id returns host path metadata only. HTTP path is not acquisition authority and this server has no artifact download route.",
  };
}

export function acquireLocalArtifacts({
  outputs = [],
  expectedNames = [],
  localDir,
  destDir,
}) {
  if (!localDir || !destDir) {
    return portableAcquisitionUnsupported();
  }
  const srcRoot = resolve(localDir);
  const destRoot = resolve(destDir);
  let srcStat;
  try {
    srcStat = lstatSync(srcRoot);
  } catch {
    throw new ConsumerRefuse("local-artifacts-missing", "local artifacts directory is not readable", {
      localDir: srcRoot,
    });
  }
  if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) {
    throw new ConsumerRefuse("local-artifacts-not-directory", "local artifacts path must be a real directory", {
      localDir: srcRoot,
    });
  }

  const names = expectedNames.length ? [...expectedNames] : outputs.map((o) => o.name).filter(Boolean);
  if (!names.length) {
    throw new ConsumerRefuse("missing-expected-outputs", "no expected artifact names for local acquisition");
  }
  const byName = new Map((outputs || []).filter((o) => o && o.name).map((o) => [o.name, o]));
  const staging = `${destRoot}.${process.pid}.${randomBytes(4).toString("hex")}.staging`;
  mkdirSync(dirname(destRoot), { recursive: true });
  mkdirSync(staging, { recursive: true });
  const files = [];
  try {
    let destParentReal;
    try {
      destParentReal = realpathSync(dirname(staging));
    } catch {
      destParentReal = resolve(dirname(staging));
    }
    if (!containedIn(destParentReal, realpathSync(staging))) {
      throw new ConsumerRefuse("path-escape", "staging directory escaped destination parent");
    }
    for (const name of names) {
      assertArtifactName(name);
      const meta = byName.get(name);
      if (!meta) {
        throw new ConsumerRefuse("missing-artifact", `result metadata missing expected output ${name}`, { name });
      }
      const src = join(srcRoot, name);
      if (!containedIn(srcRoot, src)) {
        throw new ConsumerRefuse("path-escape", "artifact path escaped local artifacts directory", { name });
      }
      let st;
      try {
        st = lstatSync(src);
      } catch {
        throw new ConsumerRefuse("missing-artifact", `local artifact ${name} is missing`, { name, src });
      }
      if (st.isSymbolicLink()) {
        throw new ConsumerRefuse("symlink-artifact", `local artifact ${name} is a symlink`, { name, src });
      }
      if (!st.isFile()) {
        throw new ConsumerRefuse("artifact-not-file", `local artifact ${name} is not a regular file`, { name, src });
      }
      const realFile = realpathSync(src);
      const realSrcRoot = realpathSync(srcRoot);
      if (!containedIn(realSrcRoot, realFile)) {
        throw new ConsumerRefuse("path-escape", "resolved artifact escaped local artifacts directory", {
          name,
          src,
        });
      }
      const buf = readFileSync(src);
      if (meta.bytes != null && buf.length !== meta.bytes) {
        throw new ConsumerRefuse("artifact-bytes-mismatch", `local artifact ${name} byte count does not match result metadata`, {
          name,
          actual: buf.length,
          expected: meta.bytes,
        });
      }
      const digest = sha256Bytes(buf);
      if (meta.sha256 && digest !== meta.sha256) {
        throw new ConsumerRefuse("artifact-hash-mismatch", `local artifact ${name} sha256 does not match result metadata`, {
          name,
          actual: digest,
          expected: meta.sha256,
        });
      }
      const destFile = join(staging, name);
      if (!containedIn(staging, destFile)) {
        throw new ConsumerRefuse("path-escape", "destination artifact escaped staging directory", { name });
      }
      writeFileSync(destFile, buf);
      files.push({ name, bytes: buf.length, sha256: digest, path: join(destRoot, name) });
    }
    try {
      lstatSync(destRoot);
      throw new ConsumerRefuse("acquire-dest-exists", "acquire destination already exists", { destDir: destRoot });
    } catch (err) {
      if (err instanceof ConsumerRefuse) throw err;
    }
    renameSync(staging, destRoot);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  return {
    code: "local-acquired",
    httpArtifactsDelivered: false,
    source: "local",
    files,
    destDir: destRoot,
    reason: "Caller-selected local copies were verified by name, bytes, and sha256. HTTP path was not used.",
  };
}
