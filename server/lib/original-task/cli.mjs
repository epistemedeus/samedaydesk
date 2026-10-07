#!/usr/bin/env node
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { originalTaskDescriptor } from "./descriptor.mjs";
import { OriginalTaskError, publicReceipt, taskRequest } from "./envelope.mjs";
import { postOriginalTask, readOriginalTask, reconcileOriginalTask, registerOriginalTask } from "./client.mjs";

function fail(code) {
  console.error(JSON.stringify({ error: { code } }));
  process.exitCode = 1;
}

function flagsOf(rest) {
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 2) flags.set(rest[index], rest[index + 1]);
  return flags;
}

function writePrivate(directory, name, value) {
  const file = join(directory, name);
  writeFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function retrievalOf(view) {
  return {
    schema: "samedaydesk.original-task-retrieval.v1",
    stage: view.stage,
    disposition: view.disposition,
    submitted: view.submitted === true,
    triaged: view.triaged === true,
    delivered: view.delivered === true,
    accepted: false,
    reused: false,
    published: false,
    exampleConsent: view.exampleConsent === true,
    ...(view.retrieval ? { retrieval: view.retrieval } : {}),
    ...(view.reason ? { reason: view.reason } : {}),
    ...(view.scope ? { scope: view.scope } : {}),
    ...(view.result ? { result: view.result } : {}),
  };
}

async function submit(rest) {
  const flags = flagsOf(rest);
  const baseUrl = flags.get("--base-url");
  const directory = flags.get("--directory");
  const taskFile = flags.get("--task-file");
  if (!baseUrl || !directory || !taskFile) return fail("arguments_required");
  let task;
  try { task = JSON.parse(readFileSync(taskFile, "utf8")); }
  catch { return fail("invalid_task"); }
  try { taskRequest(task); }
  catch (error) { return fail(error instanceof OriginalTaskError ? error.code : "invalid_task"); }
  try {
    const opened = await registerOriginalTask(directory, baseUrl);
    const posted = await postOriginalTask(directory, task);
    const reconciled = await reconcileOriginalTask(directory);
    const read = await readOriginalTask(directory);
    const receipt = publicReceipt(read, {
      discovered: true,
      submitted: posted.submitted === true,
      registrationStatus: reconciled.status,
      receiver: opened.registration.body?.receiver?.state ?? null,
      replayed: posted.checkpoint.replayed === true,
    });
    writePrivate(directory, "receipt.json", {
      ...receipt,
      projectId: read.projectId,
      registrationId: opened.registration.body?.registrationId ?? null,
    });
    writePrivate(directory, "retrieval.json", retrievalOf(read));
    console.log(JSON.stringify(receipt));
  } catch (error) {
    fail(error instanceof OriginalTaskError ? error.code : (error?.code || "request_failed"));
  }
}

async function read(rest) {
  const directory = flagsOf(rest).get("--directory");
  if (!directory) return fail("arguments_required");
  try {
    const view = await readOriginalTask(directory);
    writePrivate(directory, "retrieval.json", retrievalOf(view));
    console.log(JSON.stringify(publicReceipt(view)));
  } catch (error) {
    if (error instanceof OriginalTaskError && error.code === "grant_expired") {
      const view = {
        stage: "expired",
        disposition: "expired",
        retrieval: "grant_expired",
        submitted: false,
        triaged: false,
        delivered: false,
        accepted: false,
        reused: false,
        published: false,
        exampleConsent: false,
      };
      writePrivate(directory, "retrieval.json", retrievalOf(view));
      console.log(JSON.stringify(publicReceipt(view)));
      return;
    }
    fail(error instanceof OriginalTaskError ? error.code : (error?.code || "request_failed"));
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "describe") {
    console.log(JSON.stringify(originalTaskDescriptor()));
    return;
  }
  if (command === "submit") return submit(rest);
  if (command === "read") return read(rest);
  return fail("invalid_command");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
