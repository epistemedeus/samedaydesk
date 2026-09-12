import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deliverArgs, flagFile, readFlag, spawnDeliver } from "./invoke.mjs";
import { writePlan } from "./fixtures.mjs";
import { PRELOAD, deliverBin } from "./product.mjs";

export function runControl(root, jobId, inputs, extra = []) {
  return spawnDeliver({
    root,
    args: deliverArgs(jobId, inputs, extra),
    cwd: inputs.dir || tmpdirSafe(inputs),
  });
}

function tmpdirSafe(inputs) {
  return inputs.dir || process.cwd();
}

export function runAfterPrepare({ root, jobId, inputs, ops, extra = [] }) {
  const dir = inputs.dir;
  const planPath = writePlan(dir, ops);
  const flagPath = flagFile(dir);
  const spawned = spawnDeliver({
    root,
    args: deliverArgs(jobId, inputs, extra),
    hook: true,
    planPath,
    flagPath,
    cwd: dir,
  });
  return { ...spawned, planPath, flag: readFlag(flagPath) };
}

export function exactCli({ root, hook, args }) {
  const bin = deliverBin(root);
  if (hook) {
    return `node --import ${PRELOAD} ${bin} ${args.join(" ")}`;
  }
  return `node ${bin} ${args.join(" ")}`;
}

export function engineOutput(runOutDir, name) {
  const path = join(runOutDir, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

