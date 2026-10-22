import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { root, sha256, readJson, run, requireSuccess } from "./runtime.mjs";

export const releasePin = Object.freeze({
  name: "useful-jobs-1.4.0", bytes: 2575215,
  sha256: "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
  sourceCommit: "817a00ca226a94b0e198b29fcd06245b2a92adec",
  url: "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz",
});
export const defaultArchive = path.resolve(root, "../../../client/public/kit/useful-jobs-1.4.0.tar.gz");

export function verifyArchive(bytes) {
  assert.equal(bytes.length, releasePin.bytes, "released archive byte count");
  assert.equal(sha256(bytes), releasePin.sha256, "released archive SHA-256");
}

// Verify before extraction, then use an owned fresh directory. The trusted
// immutable archive also pins every nested vendor archive; never trust only a
// package.json version or an arbitrary previously extracted directory.
export async function acquireRelease(destination, archive = defaultArchive) {
  const bytes = archive === "download"
    ? Buffer.from(await (async () => {
      const response = await fetch(releasePin.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Archive download HTTP ${response.status}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > releasePin.bytes) throw new Error("Archive download exceeds pinned size");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    })())
    : fs.readFileSync(path.resolve(archive));
  verifyArchive(bytes);
  fs.mkdirSync(destination, { recursive: false });
  const file = path.join(destination, "release.tar.gz");
  fs.writeFileSync(file, bytes);
  requireSuccess(run("tar", ["--no-same-owner", "-xzf", file, "-C", destination]), "release extraction");
  const extracted = path.join(destination, releasePin.name);
  assert.equal(readJson(path.join(extracted, "package.json")).version, "1.4.0");
  return { root: extracted, pin: releasePin, acquisition: archive === "download" ? releasePin.url : "local pinned archive" };
}

export function exportCandidate(repository, head, destination) {
  assert.match(head, /^[a-f0-9]{40}$/, "candidate must be an exact commit SHA");
  const resolved = requireSuccess(run("git", ["-C", repository, "rev-parse", `${head}^{commit}`]), "candidate commit").stdout.trim();
  assert.equal(resolved, head);
  fs.mkdirSync(destination);
  const archive = path.join(destination, "candidate.tar");
  requireSuccess(run("git", ["-C", repository, "archive", "--format=tar", `--output=${archive}`, head, "tools/json-schema-webhook-drift"]), "candidate export");
  requireSuccess(run("tar", ["--no-same-owner", "-xf", archive, "-C", destination]), "candidate extraction");
  return {
    root: path.join(destination, "tools/json-schema-webhook-drift"), head,
    tree: requireSuccess(run("git", ["-C", repository, "rev-parse", `${head}:tools/json-schema-webhook-drift`]), "candidate tree").stdout.trim(),
  };
}
