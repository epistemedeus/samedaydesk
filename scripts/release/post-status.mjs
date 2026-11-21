#!/usr/bin/env node
// node scripts/release/post-status.mjs <sha> <state> <log-url> [description]
//
// Posts the `release-check` commit status for one exact commit with the GitHub CLI. state is one of
// success, failure, error, pending (passed and failed are accepted as success and failure). The
// status counts only for the commit it names. Needs `gh` signed in with access to the repository.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [sha, rawState, logUrl, ...rest] = process.argv.slice(2);
const state = { passed: "success", failed: "failure" }[rawState] ?? rawState;
if (!/^[0-9a-f]{40}$/.test(sha ?? "") || !["success", "failure", "error", "pending"].includes(state) || !/^https:\/\//.test(logUrl ?? "")) {
  console.error("usage: post-status.mjs <40-character sha> <success|failure|error|pending> <https log url> [description]");
  process.exit(2);
}
const { repository } = JSON.parse(readFileSync(join(root, "release/key-pages.json"), "utf8"));
let description = rest.join(" ");
if (!description) {
  try {
    const check = JSON.parse(readFileSync(join(root, "release/out/check.json"), "utf8"));
    if (check.commit === sha) description = `${check.gates.filter((g) => g.state === "passed").length}/${check.gates.length} cheap gates passed`;
  } catch {}
}
description ||= state === "success" ? "Release check passed" : "Release check did not pass";
const body = execFileSync("gh", ["api", "--method", "POST", `repos/${repository}/statuses/${sha}`,
  "-f", `state=${state}`, "-f", `target_url=${logUrl}`, "-f", `description=${description.slice(0, 140)}`, "-f", "context=release-check"], { encoding: "utf8" });
const posted = JSON.parse(body);
console.log(`release-check ${posted.state} on ${repository}@${sha.slice(0, 8)}: ${posted.description}`);
