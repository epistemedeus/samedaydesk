#!/usr/bin/env node
// SameDayDesk workflow-kits-n12-changed-period command line.
//   hashes                 bytes and sha256 of the packaged Make and n8n files
//   paths                  absolute paths of the packaged Make and n8n files
//   validate [file]        validate a mapping registry (default: the packaged one); exit 1 if invalid
//   simulate <route>       run the changed-period scenario through make, n8n or direct and print it
//   native                 run the native Useful Commerce control and print it
import { readFileSync } from "node:fs";

import { KIT_ARTIFACTS, ROUTES, artifactDigests, kitPath, runNativeControl, runScenario, validateMappingRegistry } from "../index.mjs";

const USAGE = "usage: workflow-kits-n12-changed-period <hashes|paths|validate [file]|simulate <make|n8n|direct>|native>\n";
const [command, arg] = process.argv.slice(2);
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

if (command === "hashes") {
  print(artifactDigests());
} else if (command === "paths") {
  print(Object.fromEntries(Object.entries(KIT_ARTIFACTS).map(([name, rel]) => [name, kitPath(rel)])));
} else if (command === "validate") {
  const file = arg ?? kitPath("config/mapping-registry.json");
  let registry;
  try {
    registry = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    print({ ok: false, errors: [{ code: "mapping_invalid", path: "$", message: `cannot read JSON from ${file}: ${error.message}` }] });
    process.exit(1);
  }
  const result = validateMappingRegistry(registry);
  print(result);
  if (!result.ok) process.exitCode = 1;
} else if (command === "simulate" && ROUTES.includes(arg)) {
  print(runScenario(arg));
} else if (command === "native") {
  print(runNativeControl());
} else if (command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(USAGE);
} else {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}
