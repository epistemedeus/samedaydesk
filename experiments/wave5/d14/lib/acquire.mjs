import { mkdirSync, readFileSync, renameSync, rmSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { ConsumerRefuse } from "./errors.mjs";
import { sha256Bytes } from "./digest-named.mjs";
import { getArtifact, getResult } from "./client.mjs";
import { FROZEN_REQUEST_HASH_VERSION } from "../../../../tools/managed-useful-jobs-order/lib/acquisition-constants.mjs";

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

function acquisitionHeaders({ requestHash, artifactSha256, authorization }) {
  const headers = {
    "x-request-sha256": requestHash,
    "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
  };
  if (artifactSha256) headers["x-artifact-sha256"] = artifactSha256;
  if (authorization) headers.authorization = authorization;
  return headers;
}

/**
 * Download promised files from HA2 into destDir. Never POSTs, settles, or pays.
 */
export async function acquireHttpArtifacts({
  origin,
  executionId,
  requestHash,
  expectedNames = [],
  destDir,
  authorization = null,
  fetchImpl = fetch,
}) {
  if (!origin || !executionId || !requestHash || !destDir) {
    return portableAcquisitionUnsupported({
      reason: "HTTP acquisition requires origin, executionId, requestHash, and destDir",
    });
  }
  const destRoot = resolve(destDir);
  const headers = acquisitionHeaders({ requestHash, authorization });
  const meta = await getResult(origin, executionId, { fetchImpl, headers });
  if (meta.classify?.kind === "pending-result") {
    throw new ConsumerRefuse("pending", "result is not yet available", { classify: meta.classify });
  }
  if (meta.status !== 200 || meta.body?.state !== "available") {
    throw new ConsumerRefuse(meta.classify?.code || "not-found", "hosted result is not available", {
      status: meta.status,
      classify: meta.classify,
    });
  }
  const body = meta.body;
  if (body.purchaseAuthority === true || body.sold === true) {
    throw new ConsumerRefuse("unexpected-sale", "hosted result claims a sale");
  }
  if (body.requestHash && body.requestHash !== requestHash) {
    throw new ConsumerRefuse("request-hash-mismatch", "hosted requestHash does not match the ticket binding");
  }
  const outputs = Array.isArray(body.outputs) ? body.outputs : [];
  const names = expectedNames.length ? [...expectedNames] : outputs.map((row) => row.name);
  if (names.length !== 2) {
    throw new ConsumerRefuse("missing-expected-outputs", "hosted acquisition expects two promised files");
  }
  const staging = `${destRoot}.${process.pid}.${randomBytes(4).toString("hex")}.staging`;
  mkdirSync(dirname(destRoot), { recursive: true });
  mkdirSync(staging, { recursive: true });
  const files = [];
  try {
    for (const name of names) {
      assertArtifactName(name);
      const listed = outputs.find((row) => row && row.name === name);
      if (!listed || !listed.sha256) {
        throw new ConsumerRefuse("missing-artifact", `hosted metadata missing ${name}`, { name });
      }
      const got = await getArtifact(origin, executionId, name, {
        fetchImpl,
        headers: acquisitionHeaders({ requestHash, artifactSha256: listed.sha256, authorization }),
      });
      if (got.status !== 200 || !got.bytes) {
        throw new ConsumerRefuse(got.classify?.code || "artifact-missing", `hosted artifact ${name} was not delivered`, {
          name,
          status: got.status,
        });
      }
      if (got.bytes.length !== listed.bytes) {
        throw new ConsumerRefuse("artifact-bytes-mismatch", `hosted artifact ${name} byte count does not match metadata`, {
          name,
          actual: got.bytes.length,
          expected: listed.bytes,
        });
      }
      const digest = sha256Bytes(got.bytes);
      if (digest !== listed.sha256) {
        throw new ConsumerRefuse("artifact-hash-mismatch", `hosted artifact ${name} sha256 does not match metadata`, {
          name,
          actual: digest,
          expected: listed.sha256,
        });
      }
      const destFile = join(staging, name);
      if (!containedIn(staging, destFile)) {
        throw new ConsumerRefuse("path-escape", "destination artifact escaped staging directory", { name });
      }
      writeFileSync(destFile, got.bytes);
      files.push({ name, bytes: got.bytes.length, sha256: digest, path: join(destRoot, name) });
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
    code: "http-acquired",
    httpArtifactsDelivered: true,
    source: "http",
    files,
    destDir: destRoot,
    reason: "Same-origin advertised promised files were hash/size verified into a staged directory.",
  };
}
