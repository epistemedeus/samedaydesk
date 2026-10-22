#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { ERROR_CODES } from "./constants.mjs";
import { ProgressError, errorBody } from "./errors.mjs";
import { pollTaskProgress } from "./poll.mjs";
import { projectProgress } from "./project.mjs";

function usage() {
  return `submission-progress — CX projector for I01 GET /v1/tasks/{id}

Usage:
  node src/cli.mjs project --task-json <file> [--in-flight submitting] [--bound-artifact <file>]
  node src/cli.mjs poll --base-url <url> --task-id <id> [--bearer <token>] [--bearer-env NAME]
       [--bound-artifact <file>] [--in-flight submitting]

Does not fetch artifact.ref. Does not execute artifacts. Does not invent a verifier.
paid and settled stay false. Progress is not reputation and not payout.
`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(usage());
    return 0;
  }
  if (hasFlag(args, "--fetch-ref") || hasFlag(args, "--fetch-artifact")) {
    throw new ProgressError(ERROR_CODES.FETCH_REF_FORBIDDEN, "this CLI never fetches artifact.ref");
  }
  const cmd = args[0];
  const inFlight = takeFlag(args, "--in-flight") ?? undefined;
  const boundPath = takeFlag(args, "--bound-artifact");
  const boundArtifact = boundPath ? readJson(boundPath) : undefined;

  if (cmd === "project") {
    const path = takeFlag(args, "--task-json");
    if (!path) throw new Error("--task-json is required");
    const document = projectProgress(readJson(path), {
      inFlight,
      boundArtifact,
      evidenceClass: "fixture",
    });
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return 0;
  }

  if (cmd === "poll") {
    const baseUrl = takeFlag(args, "--base-url");
    const taskId = takeFlag(args, "--task-id");
    if (!baseUrl || !taskId) throw new Error("--base-url and --task-id are required");
    const bearerEnv = takeFlag(args, "--bearer-env");
    const bearer = takeFlag(args, "--bearer") ?? (bearerEnv ? process.env[bearerEnv] : process.env.EARNED_WORK_OWNER_TOKEN);
    const document = await pollTaskProgress({
      baseUrl,
      taskId,
      bearer: bearer || null,
      boundArtifact,
      inFlight,
      evidenceClass: process.env.SUBMISSION_PROGRESS_EVIDENCE_CLASS ?? "local_runtime",
    });
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return 0;
  }

  throw new Error(`unknown command ${cmd}`);
}

main(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${JSON.stringify(errorBody(error), null, 2)}\n`);
    process.exitCode = 1;
  },
);
