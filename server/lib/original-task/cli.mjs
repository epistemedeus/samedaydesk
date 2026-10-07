#!/usr/bin/env node
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { originalTaskDescriptor } from "./descriptor.mjs";
import { OriginalTaskError, publicReceipt } from "./envelope.mjs";
import { postOriginalTask, readOriginalTask, reconcileOriginalTask, registerOriginalTask } from "./client.mjs";

function fail(code) {
  console.error(JSON.stringify({ error: { code } }));
  process.exitCode = 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "describe") {
    console.log(JSON.stringify(originalTaskDescriptor()));
    return;
  }
  if (command !== "submit") return fail("invalid_command");
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 2) flags.set(rest[index], rest[index + 1]);
  const baseUrl = flags.get("--base-url");
  const directory = flags.get("--directory");
  const taskFile = flags.get("--task-file");
  if (!baseUrl || !directory || !taskFile) return fail("arguments_required");
  const ownerQa = process.env.ORIGINAL_TASK_OWNER_QA === "1";
  try {
    const task = JSON.parse(readFileSync(taskFile, "utf8"));
    const opened = await registerOriginalTask(directory, baseUrl, { ownerQa });
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
    const receiptPath = join(directory, "receipt.json");
    writeFileSync(receiptPath, `${JSON.stringify({
      ...receipt,
      projectId: read.projectId,
      registrationId: opened.registration.body?.registrationId ?? null,
    })}\n`, { mode: 0o600 });
    chmodSync(receiptPath, 0o600);
    console.log(JSON.stringify(receipt));
  } catch (error) {
    fail(error instanceof OriginalTaskError ? error.code : (error?.code || "request_failed"));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
