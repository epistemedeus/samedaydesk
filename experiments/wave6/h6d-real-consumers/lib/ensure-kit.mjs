import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractKit } from "./kit.mjs";

/** Extract useful-jobs 1.4.0 into destDir if the CLI is missing. */
export function ensureKitAt(destDir) {
  const dest = resolve(destDir);
  const cli = join(dest, "useful-jobs-1.4.0", "bin", "useful-jobs.mjs");
  if (existsSync(cli)) {
    return { root: join(dest, "useful-jobs-1.4.0"), cli, extracted: false };
  }
  mkdirSync(dest, { recursive: true });
  return { ...extractKit({ destDir: dest }), extracted: true };
}
