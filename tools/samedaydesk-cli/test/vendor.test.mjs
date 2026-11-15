import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

test("vendored task-continuation bytes match SOURCE.json", () => {
  const source = JSON.parse(readFileSync(join(root, "vendor/task-continuation/SOURCE.json"), "utf8"));
  assert.equal(source.commit, "6c8edfd755d8e254659d9f8357c123c8da36bd44");
  for (const file of source.files) {
    const bytes = readFileSync(join(root, "vendor/task-continuation", file.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(blob, file.gitBlob, file.path);
  }
});

test("authored files contain no em dash", () => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "vendor" ? [] : walk(path);
    return [path];
  });
  for (const file of walk(root)) assert.ok(!readFileSync(file, "utf8").includes("\u2014"), file);
});
