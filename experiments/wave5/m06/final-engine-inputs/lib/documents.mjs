import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadDocuments(entry, kit) {
  if (entry.transport === "missing") {
    return null;
  }
  if (entry.transport === "example") {
    const dir = join(kit.root, "engines/json-schema-webhook-drift/fixtures/example");
    return {
      before: JSON.parse(readFileSync(join(dir, "before.json"), "utf8")),
      after: JSON.parse(readFileSync(join(dir, "after.json"), "utf8")),
      used: JSON.parse(readFileSync(join(dir, "used.json"), "utf8")),
    };
  }
  if (entry.transport === "kit-sample") {
    const dir = join(kit.root, entry.kitSample);
    return {
      before: JSON.parse(readFileSync(join(dir, "before.json"), "utf8")),
      after: JSON.parse(readFileSync(join(dir, "after.json"), "utf8")),
      used: JSON.parse(readFileSync(join(dir, "used.json"), "utf8")),
    };
  }
  return {
    before: entry.before,
    after: entry.after,
    used: entry.used,
  };
}
