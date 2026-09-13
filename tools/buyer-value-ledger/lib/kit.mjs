import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import {
  ERROR_CODES,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_REL,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_ROOT_NAME,
} from "./pins.mjs";
import { sha256Bytes } from "./hash-terms.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function verifyArchiveBuffer(buf) {
  if (!Buffer.isBuffer(buf) && !ArrayBuffer.isView(buf)) {
    throw Object.assign(new Error("archive buffer required"), { code: ERROR_CODES.ARCHIVE_PIN_MISMATCH });
  }
  const bytes = buf.length;
  const digest = sha256Bytes(buf);
  if (bytes !== USEFUL_JOBS_ARCHIVE_BYTES || digest !== USEFUL_JOBS_ARCHIVE_SHA256) {
    const err = new Error(
      `useful-jobs archive pin mismatch size ${bytes} sha256 ${digest}`,
    );
    err.code = ERROR_CODES.ARCHIVE_PIN_MISMATCH;
    err.bytes = bytes;
    err.sha256 = digest;
    throw err;
  }
  return { bytes, sha256: digest };
}

export async function fetchArchiveHttp(origin, archivePath = `/${USEFUL_JOBS_ARCHIVE_REL}`) {
  const url = `${String(origin).replace(/\/$/, "")}${archivePath.startsWith("/") ? archivePath : `/${archivePath}`}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`archive HTTP ${res.status}`);
    err.code = ERROR_CODES.ARCHIVE_PIN_MISMATCH;
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const pin = verifyArchiveBuffer(buf);
  return { ...pin, buf, url, via: "local-http" };
}

export function readArchiveFile(archivePath = USEFUL_JOBS_ARCHIVE_PATH) {
  const buf = readFileSync(archivePath);
  const pin = verifyArchiveBuffer(buf);
  return { ...pin, buf, path: archivePath, via: "local-file" };
}

export function cacheRoot(sha = USEFUL_JOBS_ARCHIVE_SHA256) {
  return join(tmpdir(), `sds-buyer-value-ledger-${sha.slice(0, 16)}`);
}

export function kitPath(root = cacheRoot()) {
  return join(root, USEFUL_JOBS_ROOT_NAME);
}

/**
 * Extract the committed public useful-jobs archive. Reuses engines; does not
 * reimplement jobs. kitSource is local-file unless a buffer from HTTP is passed.
 */
export function ensureUsefulJobsKit({ archivePath = USEFUL_JOBS_ARCHIVE_PATH, buffer = null, kitSource = null } = {}) {
  const dest = cacheRoot();
  const kit = kitPath(dest);
  const ready = join(dest, ".ready");
  const cli = join(kit, USEFUL_JOBS_CLI);
  if (existsSync(ready) && existsSync(cli)) {
    return { kit, kitSource: kitSource || "local-file", cached: true };
  }

  mkdirSync(dest, { recursive: true });
  const lockPath = join(dest, ".extracting");
  let gotLock = false;
  for (let i = 0; i < 120; i += 1) {
    if (existsSync(ready) && existsSync(cli)) {
      return { kit, kitSource: kitSource || "local-file", cached: true };
    }
    try {
      mkdirSync(lockPath);
      gotLock = true;
      break;
    } catch {
      sleep(250);
    }
  }
  if (!gotLock) {
    if (existsSync(cli)) return { kit, kitSource: kitSource || "local-file", cached: true };
    throw new Error("timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!existsSync(cli)) {
      const fetched = buffer
        ? { buf: buffer, via: kitSource || "local-http" }
        : readArchiveFile(archivePath);
      verifyArchiveBuffer(fetched.buf);
      const tgz = join(dest, "useful-jobs-1.0.0.tar.gz");
      writeFileSync(tgz, fetched.buf);
      const tar = spawnSync("tar", ["-xzf", tgz, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) {
        throw new Error(String(tar.stderr || "tar extract failed"));
      }
      kitSource = kitSource || fetched.via || "local-file";
    }
    writeFileSync(ready, `${USEFUL_JOBS_ARCHIVE_SHA256}\n`);
    return { kit, kitSource: kitSource || "local-file", cached: false };
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function serveArchive(archivePath = USEFUL_JOBS_ARCHIVE_PATH) {
  const payload = readFileSync(archivePath);
  verifyArchiveBuffer(payload);
  const path = `/${USEFUL_JOBS_ARCHIVE_REL}`;
  const server = http.createServer((req, res) => {
    if (req.url !== path) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/gzip",
      "content-length": String(payload.length),
    });
    res.end(payload);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        path,
        port,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
