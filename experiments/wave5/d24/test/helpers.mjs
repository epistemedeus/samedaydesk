import { copyFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { D24_ROOT, PINS } from "../lib/pins.mjs";
import { installCleanPrefix, prefixLayout } from "../lib/install.mjs";

export const CALLER_BEFORE = join(D24_ROOT, "fixtures/caller/vendor-budget-impact/before.json");
export const CALLER_AFTER = join(D24_ROOT, "fixtures/caller/vendor-budget-impact/after.json");

let cachedPrefix = null;

export function sharedPrefix() {
  const dest = join(tmpdir(), `w5-d24-prefix-${PINS.tested.d01.sha.slice(0, 12)}`);
  if (cachedPrefix === dest && existsSync(join(dest, "INSTALL.json"))) return dest;
  if (existsSync(join(dest, "INSTALL.json"))) {
    cachedPrefix = dest;
    return dest;
  }
  installCleanPrefix(dest);
  cachedPrefix = dest;
  return dest;
}

export function archivePath(prefix) {
  return join(prefixLayout(prefix).assets, "useful-jobs-1.0.0.tar.gz");
}

export function stageCaller(prefix) {
  const layout = prefixLayout(prefix);
  copyFileSync(CALLER_BEFORE, join(layout.caller, "before.json"));
  copyFileSync(CALLER_AFTER, join(layout.caller, "after.json"));
  return {
    before: join(layout.caller, "before.json"),
    after: join(layout.caller, "after.json"),
  };
}

export function extractFeedSamples(prefix, dest) {
  mkdirSync(dest, { recursive: true });
  const result = spawnSync(
    "tar",
    ["-xzf", archivePath(prefix), "-C", dest, "useful-jobs-1.0.0/samples/feed/a"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "tar extract of feed samples failed");
  return {
    before: join(dest, "useful-jobs-1.0.0/samples/feed/a/before.xml"),
    after: join(dest, "useful-jobs-1.0.0/samples/feed/a/after.xml"),
  };
}

export function writeStubNode(path, payload) {
  writeFileSync(
    path,
    `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(`${JSON.stringify(payload)}\n`)});
process.exit(0);
`,
  );
  chmodSync(path, 0o755);
}
