#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const capi = process.env.WASMTIME_CAPI_ROOT;
if (!capi) {
  process.stderr.write("WASMTIME_CAPI_ROOT is required to rebuild the embed binary\n");
  process.exit(2);
}
const include = path.join(capi, "include");
const library = path.join(capi, "lib", "libwasmtime.a");
const object = path.join(tmpdir(), `foundry-wasmtime49-${process.pid}.o`);
const binary = path.join(root, "bin", "foundry-wasmtime49");
const compile = spawnSync("gcc", [
  "-O2", "-std=c11", "-Wall", "-Wextra", "-Wno-unused-parameter",
  `-I${include}`, "-c", path.join(root, "child.c"), "-o", object,
], { encoding: "utf8" });
if (compile.status !== 0) {
  process.stderr.write(compile.stderr || "compile failed\n");
  process.exit(compile.status || 1);
}
const link = spawnSync("gcc", ["-O2", object, library, "-lpthread", "-ldl", "-lm", "-o", binary], { encoding: "utf8" });
if (link.status !== 0) {
  process.stderr.write(link.stderr || "link failed\n");
  process.exit(link.status || 1);
}
spawnSync("strip", [binary]);
const digest = createHash("sha256").update(readFileSync(binary)).digest("hex");
process.stdout.write(`${JSON.stringify({ binarySha256: digest })}\n`);
