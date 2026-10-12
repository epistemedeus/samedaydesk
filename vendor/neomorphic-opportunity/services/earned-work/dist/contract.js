import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const KERNEL_CONTRACT = JSON.parse(readFileSync(path.join(rootDir, "contract/kernel-v1.json"), "utf8"));
export const KERNEL_CONTRACT_ID = KERNEL_CONTRACT.id;
//# sourceMappingURL=contract.js.map