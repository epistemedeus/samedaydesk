#!/usr/bin/env node
// Prebuilt probe child. Modes are fixed; this file is hash-pinned.
const mode = process.argv[2];

if (mode === "echo") {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    process.stdout.write(Buffer.concat(chunks));
    process.exit(0);
  });
} else if (mode === "signal") {
  process.on("SIGTERM", () => {
    process.stdout.write("sigterm\n", () => process.exit(0));
  });
  process.stdout.write("ready\n");
  setInterval(() => {}, 1000);
} else if (mode === "spin") {
  process.stdout.write("ready\n");
  const end = Date.now() + 20_000;
  while (Date.now() < end) Math.sqrt(Math.random());
  process.exit(0);
} else if (mode === "sleep") {
  process.stdout.write("ready\n");
  setTimeout(() => process.exit(0), 30_000);
} else if (mode === "identity") {
  const { readFileSync } = await import("node:fs");
  const stat = readFileSync("/proc/self/stat", "utf8");
  process.stdout.write(JSON.stringify({ pid: process.pid, stat }) + "\n");
  process.exit(0);
} else {
  process.stderr.write("unknown mode\n");
  process.exit(2);
}
