// Runs inside a fresh user and mount namespace. The producer files are hidden
// before decide-or-reuse starts, and the child records whether they stayed empty.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
execFileSync("mount", ["--bind", "/dev/null", job.recipe], { stdio: "ignore" });
execFileSync("mount", ["--bind", "/dev/null", job.producer], { stdio: "ignore" });
const hidden = readFileSync(job.recipe).length + readFileSync(job.producer).length;
writeFileSync(job.proof, String(hidden));
const ran = spawnSync(process.execPath, job.argv, { cwd: job.work, encoding: "utf8" });
writeFileSync(`${job.proof}.stdout`, ran.stdout || "");
writeFileSync(`${job.proof}.stderr`, ran.stderr || "");
writeFileSync(`${job.proof}.status`, String(ran.status ?? "null"));
process.exit(ran.status ?? 1);
