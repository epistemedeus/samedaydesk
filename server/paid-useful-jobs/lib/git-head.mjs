import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./pins.mjs";

/** Current git HEAD of this tree. Consumer pins should record the SHA they tested. */
export function repoHead(cwd = REPO_ROOT) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return "";
  return String(r.stdout || "").trim();
}
