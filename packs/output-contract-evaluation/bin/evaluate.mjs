#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chdir } from "node:process";
import { main } from "../../../tools/output-contract-evaluation/cli.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packRoot = resolve(here, "..");
const repoRoot = resolve(packRoot, "../..");

const argv = process.argv.slice(2);
const hasCase = argv.includes("--case");
if (hasCase) {
  const idx = argv.indexOf("--case");
  const value = argv[idx + 1];
  if (value && !value.startsWith("/") && !value.startsWith("packs/")) {
    argv[idx + 1] = join(packRoot, value.startsWith("fixtures/") ? value : join("fixtures", value));
  }
}

chdir(repoRoot);
const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) main(argv);
