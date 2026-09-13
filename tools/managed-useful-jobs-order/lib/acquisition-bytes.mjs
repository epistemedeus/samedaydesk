import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_FILE_BYTES } from "./acquisition-constants.mjs";
import { acquisitionRefuse } from "./acquisition-errors.mjs";
import { sha256Bytes } from "./acquisition-identity.mjs";

const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW, O_NONBLOCK } = constants;
if (!O_NONBLOCK) {
  throw new Error("HA1 artifact open requires O_NONBLOCK so a FIFO replace cannot block the process");
}
const READ_FLAGS = O_RDONLY | O_NOFOLLOW | O_NONBLOCK;
const WRITE_FLAGS = O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW;

function assertInsideRoot(root, target) {
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.split(sep).includes("..")) {
    throw acquisitionRefuse("hostile-path", "path escapes the private artifact root");
  }
}

function assertOwnedParents(absFile, root) {
  const uid = process.getuid();
  let current = dirname(absFile);
  for (;;) {
    let st;
    try {
      st = lstatSync(current);
    } catch {
      throw acquisitionRefuse("hostile-path", "artifact parent is missing");
    }
    if (st.isSymbolicLink()) {
      throw acquisitionRefuse("hostile-path", "artifact parent is a symlink");
    }
    if (!st.isDirectory()) {
      throw acquisitionRefuse("hostile-path", "artifact parent is not a directory");
    }
    if (typeof uid === "number" && st.uid !== uid) {
      throw acquisitionRefuse("hostile-path", "artifact parent is not service-owned");
    }
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) {
      throw acquisitionRefuse("hostile-path", "artifact path escaped the service root");
    }
    current = parent;
  }
}

function assertRegularNoLink(st, label) {
  if (!st.isFile()) {
    throw acquisitionRefuse("hostile-path", `${label} is not a regular file`, {
      state: "integrity-failed",
    });
  }
  if (st.nlink !== 1) {
    throw acquisitionRefuse("hostile-path", `${label} must have link count one`, {
      state: "integrity-failed",
    });
  }
  if (st.size > MAX_FILE_BYTES) {
    throw acquisitionRefuse("oversize", `${label} exceeds per-file bound`);
  }
}

export function artifactDir(artifactRoot, executionId) {
  const root = resolve(artifactRoot);
  const dir = resolve(root, executionId);
  assertInsideRoot(root, dir);
  return { root, dir };
}

export function artifactPath(artifactRoot, executionId, name) {
  const { root, dir } = artifactDir(artifactRoot, executionId);
  const path = resolve(dir, name);
  assertInsideRoot(dir, path);
  if (dirname(path) !== dir) {
    throw acquisitionRefuse("hostile-path", "artifact name resolved outside its execution directory");
  }
  return { root, dir, path };
}

function openNoFollow(path, flags, mode) {
  try {
    return openSync(path, flags, mode);
  } catch (err) {
    if (err?.code === "ELOOP" || err?.code === "EMLINK") {
      throw acquisitionRefuse("hostile-path", "refusing to follow a link at the artifact path", {
        state: "integrity-failed",
      });
    }
    if (err?.code === "ENXIO" || err?.code === "EAGAIN" || err?.code === "EWOULDBLOCK" || err?.code === "ENOTSUP") {
      throw acquisitionRefuse("hostile-path", "nonblocking open refused; path is not a regular file", {
        state: "integrity-failed",
      });
    }
    throw err;
  }
}

export function writeVerifiedArtifacts(artifactRoot, executionId, files) {
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  const root = resolve(artifactRoot);
  const dest = resolve(root, executionId);
  assertInsideRoot(root, dest);
  if (existsSync(dest)) {
    const st = lstatSync(dest);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw acquisitionRefuse("hostile-path", "artifact destination is not a service directory");
    }
  }
  const stage = join(root, `.${executionId}.stage-${process.pid}-${randomUUID()}`);
  mkdirSync(stage, { recursive: true, mode: 0o700 });
  try {
    for (const file of files) {
      const path = join(stage, file.metadata.name);
      const fd = openNoFollow(path, WRITE_FLAGS, 0o600);
      try {
        const buf = Buffer.from(file.bytes);
        let offset = 0;
        while (offset < buf.length) {
          const n = writeSync(fd, buf, offset, buf.length - offset);
          if (n <= 0) break;
          offset += n;
        }
        const st = fstatSync(fd);
        assertRegularNoLink(st, file.metadata.name);
        if (st.size !== file.metadata.bytes) {
          throw acquisitionRefuse("integrity-failed", "staged file length does not match the output tuple");
        }
      } finally {
        closeSync(fd);
      }
    }
    try {
      renameSync(stage, dest);
    } catch (err) {
      if (existsSync(dest)) {
        for (const file of files) {
          const existing = readVerifiedBytes(artifactRoot, executionId, file.metadata);
          if (existing.sha256 !== file.metadata.sha256 || existing.bytes.length !== file.metadata.bytes) {
            throw acquisitionRefuse("identity-conflict", "competing publication wrote different artifact bytes");
          }
        }
        return dest;
      }
      throw err;
    }
    return dest;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export function readVerifiedBytes(artifactRoot, executionId, expected, { signal, afterOpen, betweenLstatAndOpen } = {}) {
  if (signal?.aborted) {
    throw acquisitionRefuse("aborted", "artifact open aborted before bytes were exposed");
  }
  const { root, dir, path } = artifactPath(artifactRoot, executionId, expected.name);
  if (!existsSync(root) || !existsSync(dir) || !existsSync(path)) {
    throw acquisitionRefuse("integrity-failed", "committed artifact bytes are missing");
  }
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw acquisitionRefuse("hostile-path", "artifact root is not a service-owned directory");
  }
  const dirStat = lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw acquisitionRefuse("hostile-path", "execution artifact directory is not a regular directory");
  }
  assertOwnedParents(path, root);

  const pathBefore = lstatSync(path);
  if (pathBefore.isSymbolicLink()) {
    throw acquisitionRefuse("hostile-path", "artifact path is a symlink");
  }
  if (typeof pathBefore.isFIFO === "function" && pathBefore.isFIFO()) {
    throw acquisitionRefuse("hostile-path", "artifact path is a FIFO");
  }
  assertRegularNoLink(pathBefore, expected.name);

  if (typeof betweenLstatAndOpen === "function") betweenLstatAndOpen(path);

  const fd = openNoFollow(path, READ_FLAGS);
  try {
    if (signal?.aborted) {
      throw acquisitionRefuse("aborted", "artifact open aborted; handle released");
    }
    if (typeof afterOpen === "function") afterOpen(fd, path);
    const fdStat = fstatSync(fd);
    if (typeof fdStat.isFIFO === "function" && fdStat.isFIFO()) {
      throw acquisitionRefuse("hostile-path", "opened fd is a FIFO; refusing to block or expose bytes", {
        state: "integrity-failed",
      });
    }
    assertRegularNoLink(fdStat, expected.name);
    const pathAfter = lstatSync(path);
    if (pathAfter.isSymbolicLink()) {
      throw acquisitionRefuse("hostile-path", "artifact path became a symlink");
    }
    if (fdStat.dev !== pathAfter.dev || fdStat.ino !== pathAfter.ino || fdStat.dev !== pathBefore.dev || fdStat.ino !== pathBefore.ino) {
      throw acquisitionRefuse("hostile-path", "path-swap detected; refusing to expose bytes", {
        state: "integrity-failed",
      });
    }
    if (fdStat.size !== expected.bytes) {
      throw acquisitionRefuse("integrity-failed", "artifact length does not match the committed tuple");
    }
    const buf = Buffer.alloc(fdStat.size);
    let offset = 0;
    while (offset < fdStat.size) {
      if (signal?.aborted) {
        throw acquisitionRefuse("aborted", "artifact read aborted; handle released");
      }
      const n = readSync(fd, buf, offset, fdStat.size - offset, offset);
      if (n === 0) break;
      offset += n;
    }
    if (offset !== fdStat.size) {
      throw acquisitionRefuse("integrity-failed", "artifact read was truncated");
    }
    const digest = sha256Bytes(buf);
    if (digest !== expected.sha256) {
      throw acquisitionRefuse("integrity-failed", "artifact hash does not match the committed tuple");
    }
    const pathFinal = lstatSync(path);
    if (pathFinal.dev !== fdStat.dev || pathFinal.ino !== fdStat.ino) {
      throw acquisitionRefuse("hostile-path", "path-swap after read; refusing to expose bytes", {
        state: "integrity-failed",
      });
    }
    return { bytes: new Uint8Array(buf), sha256: digest, metadata: { ...expected } };
  } finally {
    closeSync(fd);
  }
}

export function purgeArtifactDir(artifactRoot, executionId) {
  const { root, dir } = artifactDir(artifactRoot, executionId);
  if (!existsSync(dir)) return;
  const st = lstatSync(dir);
  if (st.isSymbolicLink()) {
    throw acquisitionRefuse("hostile-path", "refusing to purge a symlink artifact directory");
  }
  assertInsideRoot(root, dir);
  rmSync(dir, { recursive: true, force: true });
}
