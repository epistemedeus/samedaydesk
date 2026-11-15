#!/usr/bin/env node
// SameDayDesk workflow-kits-n12 command line.
//   workflow-kits-n12 hashes   bytes and sha256 of the packaged Make and n8n files
//   workflow-kits-n12 direct   run the direct journey (synthetic, in process) and print it
//   workflow-kits-n12 paths    absolute paths of the packaged Make and n8n files
//   workflow-kits-n12 serve    start the local client endpoint (same as bin/serve.mjs)
import { KIT_ARTIFACTS, artifactDigests, kitPath, runDirectJourney } from "../index.mjs";

const USAGE = "usage: workflow-kits-n12 <hashes|direct|paths|serve>\n";
const command = process.argv[2];
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

if (command === "hashes") {
  print(artifactDigests());
} else if (command === "direct") {
  print(runDirectJourney());
} else if (command === "paths") {
  print(Object.fromEntries(Object.entries(KIT_ARTIFACTS).map(([name, rel]) => [name, kitPath(rel)])));
} else if (command === "serve") {
  await import("./serve.mjs");
} else if (command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(USAGE);
} else {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}
