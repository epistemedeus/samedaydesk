import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./hash.mjs";

function mimeAllowed(mime, allowed) {
  if (!mime) return true;
  return allowed.includes(mime);
}

/**
 * Copy or download an archive and verify status/size/digest. Never extract here.
 * Follows the SDS obtain-archive contract (s260/s227): mismatch stops before extract.
 */
export async function acquireArchive({ fetchUrl, target, expected, workDir }) {
  const downloadDir = join(workDir, "download");
  mkdirSync(downloadDir, { recursive: true });
  const archiveUrl = expected.archiveUrl || target.live.archive;
  const filename = archiveUrl.split("/").pop() || "archive.tar.gz";
  const archivePath = join(downloadDir, filename);
  const maxBytes = Number(expected.bytes) + 1;

  const base = {
    extracted: false,
    stoppedBeforeExtract: true,
    archivePath: null,
    status: 0,
    bytes: 0,
    sha256: null,
    expectedBytes: expected.bytes,
    expectedSha256: expected.sha256,
    url: archiveUrl,
    githubCredentialsRequired: false,
  };

  let response;
  try {
    response = await fetchUrl(archiveUrl, {
      maxBytes,
      timeoutMs: 60_000,
      accept: "application/gzip, application/x-gzip, application/octet-stream, */*",
    });
  } catch (error) {
    return {
      ...base,
      ok: false,
      code: error.code || "acquire_failed",
      message: error.message,
    };
  }

  const bytes = response.body.length;
  const digest = sha256(response.body);
  const filled = {
    ...base,
    status: response.status,
    bytes,
    sha256: digest,
    mime: response.mime,
  };

  if (response.status !== 200) {
    return {
      ...filled,
      ok: false,
      code: "unexpected_status",
      message: `${target.id}: archive HTTP ${response.status}; extract skipped`,
    };
  }

  if (target.enforceMime && !mimeAllowed(response.mime, target.allowedMime || [])) {
    return {
      ...filled,
      ok: false,
      code: "unexpected_mime",
      message: `${target.id}: archive MIME ${response.mime || "(missing)"} is not an allowed gzip type; extract skipped`,
    };
  }

  if (bytes !== expected.bytes) {
    return {
      ...filled,
      ok: false,
      code: "size_mismatch",
      message: `${target.id}: archive size ${bytes} != ${expected.bytes}; extract skipped`,
    };
  }

  if (digest !== expected.sha256) {
    return {
      ...filled,
      ok: false,
      code: "digest_mismatch",
      message: `${target.id}: archive digest mismatch; extract skipped`,
    };
  }

  writeFileSync(archivePath, response.body);
  if (!existsSync(archivePath)) {
    return {
      ...filled,
      ok: false,
      code: "write_failed",
      message: `${target.id}: archive write failed; extract skipped`,
    };
  }

  return {
    ...filled,
    ok: true,
    archivePath,
    stoppedBeforeExtract: false,
    code: "acquired",
    message: `${target.id}: archive status/size/digest matched`,
  };
}
