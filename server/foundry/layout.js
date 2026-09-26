import { existsSync } from "node:fs";
import path from "node:path";
import { LAYOUT_FILES, RECEIVER_ROOT } from "./paths.js";

export const RECEIVER_LAYOUT = LAYOUT_FILES;

export function resolveLayout(root = RECEIVER_ROOT, files = RECEIVER_LAYOUT) {
  if (!root) return { ok: false, missing: ["root"] };
  const missing = files.filter((rel) => !existsSync(path.join(root, rel)));
  return { ok: missing.length === 0, missing, root };
}

export function packagedReceiverLayout() {
  return resolveLayout(RECEIVER_ROOT, RECEIVER_LAYOUT);
}
