import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/a2a-cancel-interoperability.mjs");

test("CLI help does not boot a server", async () => {
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, "--help"], { cwd: root });
    let stdout = "";
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.on("close", (status) => resolve({ status, stdout }));
  });
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.help, true);
  assert.equal(json.paymentAuthority, "none");
});
