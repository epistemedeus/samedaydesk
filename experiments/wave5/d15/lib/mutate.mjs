import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function mutateLive(snapshot, mutate) {
  if (!mutate) return null;
  const key = mutate.key;
  const entry = snapshot.files[key];
  if (!entry) {
    const err = new Error(`mutate key not frozen: ${key}`);
    err.code = "mutate-unknown-key";
    throw err;
  }
  if (entry.kind === "directory") {
    const rel = mutate.rel || "after.json";
    const liveFile = join(entry.livePath, rel);
    if (mutate.mode === "identical-before") {
      copyFileSync(join(entry.livePath, "before.json"), liveFile);
    } else if (mutate.mode === "overwrite" && mutate.file) {
      copyFileSync(mutate.file, liveFile);
    } else {
      writeFileSync(liveFile, `${readFileSync(liveFile, "utf8").trim()}\nMUTATED\n`);
    }
    return { key, kind: "directory", livePath: liveFile, rel };
  }
  if (mutate.mode === "identical-before") {
    const before = snapshot.files.before;
    if (!before || before.kind !== "file") {
      const err = new Error("identical-before needs a frozen file input named before");
      err.code = "mutate-identical-before-missing";
      throw err;
    }
    copyFileSync(before.livePath, entry.livePath);
    return { key, kind: "file", livePath: entry.livePath, mode: mutate.mode };
  }
  if (mutate.mode === "overwrite" && mutate.file) {
    copyFileSync(mutate.file, entry.livePath);
    return { key, kind: "file", livePath: entry.livePath, mode: mutate.mode };
  }
  const err = new Error(`unsupported mutate mode ${mutate.mode || "(none)"}`);
  err.code = "mutate-unsupported";
  throw err;
}
