import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ORIGINAL_TASK_DESCRIPTOR_PATH = "/discovery/original-task-correspondence.json";
const file = fileURLToPath(new URL("../../../client/public/discovery/original-task-correspondence.json", import.meta.url));

export function originalTaskDescriptor() {
  return JSON.parse(readFileSync(file, "utf8"));
}
