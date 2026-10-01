#!/usr/bin/env node
// Applies the packed kernel migration. Generic DATABASE_URL is not a fallback.
// The kernel file is not rewritten. This wrapper deletes DATABASE_URL before
// spawning it and requires the dedicated earned-work URL and schema.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "pilot_earned_work";
const url = String(process.env.EARNED_WORK_DATABASE_URL || "").trim();
if (!url) {
  console.error("EARNED_WORK_DATABASE_URL is required; DATABASE_URL does not migrate earned-work");
  process.exit(1);
}
const requested = String(process.env.EARNED_WORK_PG_SCHEMA || "").trim();
if (requested && requested !== SCHEMA) {
  console.error("shared host migration requires schema pilot_earned_work");
  process.exit(1);
}

const env = { ...process.env, EARNED_WORK_DATABASE_URL: url, EARNED_WORK_PG_SCHEMA: SCHEMA };
delete env.DATABASE_URL;

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../vendor/neomorphic-earned-work-host/kernel/dist/migrate.js",
);
const child = spawn(process.execPath, [script], { env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
