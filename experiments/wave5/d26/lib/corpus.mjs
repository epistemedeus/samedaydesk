import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_H04_ROOT,
  ERROR_CODES,
  H04_SHA,
  OWNED_DIR,
} from "./pins.mjs";
import { throwRefuse } from "./refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CORPUS_MANIFEST_PATH = join(here, "../fixtures/corpus/h04-lockfile-pairs.json");

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function loadCorpusManifest() {
  return JSON.parse(readFileSync(CORPUS_MANIFEST_PATH, "utf8"));
}

export function loadH04Pair(entry, { h04Root = DEFAULT_H04_ROOT, yarnPrefixBytes = 8192 } = {}) {
  const dir = join(h04Root, entry.rel);
  const beforePath = join(dir, entry.before.name);
  const afterPath = join(dir, entry.after.name);
  if (!existsSync(beforePath) || !existsSync(afterPath)) {
    throwRefuse(
      ERROR_CODES.H04_CORPUS_MISSING,
      `H04 pair ${entry.id} missing under ${h04Root}`,
      { beforePath, afterPath, expectedSha: H04_SHA },
    );
  }
  let beforeBuf = readFileSync(beforePath);
  let afterBuf = readFileSync(afterPath);
  const beforeSha = sha256Bytes(beforeBuf);
  const afterSha = sha256Bytes(afterBuf);
  if (beforeSha !== entry.before.sha256 || afterSha !== entry.after.sha256) {
    throwRefuse(
      ERROR_CODES.CORPUS_DIGEST_MISMATCH,
      `H04 pair ${entry.id} digest mismatch`,
      { beforeSha, afterSha, expectedBefore: entry.before.sha256, expectedAfter: entry.after.sha256 },
    );
  }
  const httpMode = entry.httpMode || "full";
  if (httpMode === "leading-8192-bytes") {
    beforeBuf = beforeBuf.subarray(0, yarnPrefixBytes);
    afterBuf = afterBuf.subarray(0, yarnPrefixBytes);
  }
  const beforeText = beforeBuf.toString("utf8");
  const afterText = afterBuf.toString("utf8");
  let beforeJson = null;
  let afterJson = null;
  if (entry.before.name.endsWith(".json")) {
    beforeJson = JSON.parse(beforeText);
    afterJson = JSON.parse(afterText);
  }
  return {
    id: entry.id,
    family: entry.family,
    kind: entry.kind,
    rel: entry.rel,
    httpMode,
    beforeBytes: entry.before.bytes,
    afterBytes: entry.after.bytes,
    beforeSha,
    afterSha,
    beforeText,
    afterText,
    beforeJson,
    afterJson,
    body: beforeJson && afterJson
      ? { before: beforeJson, after: afterJson }
      : { before: beforeText, after: afterText },
  };
}

export function loadH04Pairs({ h04Root = DEFAULT_H04_ROOT } = {}) {
  if (!existsSync(h04Root)) {
    throwRefuse(ERROR_CODES.H04_CORPUS_MISSING, `H04 worktree missing at ${h04Root}`, { h04Root, expectedSha: H04_SHA });
  }
  const manifest = loadCorpusManifest();
  return manifest.pairs.map((entry) => loadH04Pair(entry, { h04Root }));
}

export { OWNED_DIR };
