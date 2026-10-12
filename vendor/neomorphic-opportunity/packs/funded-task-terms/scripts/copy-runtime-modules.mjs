import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "dist");
mkdirSync(dest, { recursive: true });

const runtimeModules = ["canonical.mjs", "hash.mjs", "canonical.d.mts", "hash.d.mts"];
for (const name of runtimeModules) {
  copyFileSync(join(root, "src", name), join(dest, name));
}
