import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deliverBin, PRELOAD } from "./product.mjs";

export function parseJsonStdout(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function analysisOf(body) {
  return body?.order?.wrapper?.analysis || body?.first?.order?.wrapper?.analysis || body?.analysis || null;
}

export function outcomeOf(body) {
  const analysis = analysisOf(body);
  return analysis?.outcome || analysis?.status || null;
}

export function spawnDeliver({
  root,
  args,
  hook = false,
  planPath = null,
  flagPath = null,
  cwd = null,
  timeoutMs = 180_000,
  extraEnv = {},
}) {
  const nodeArgs = [];
  if (hook) nodeArgs.push("--import", pathToFileURL(PRELOAD).href);
  nodeArgs.push(deliverBin(root), ...args);
  const env = { ...process.env, ...extraEnv };
  if (planPath) env.D15_FREEZE_PLAN = planPath;
  if (flagPath) env.D15_FREEZE_FLAG = flagPath;
  const result = spawnSync(process.execPath, nodeArgs, {
    encoding: "utf8",
    cwd: cwd || tmpdir(),
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env,
  });
  const body = parseJsonStdout(result.stdout);
  return {
    status: result.status,
    signal: result.signal,
    stderr: result.stderr || "",
    stdout: result.stdout || "",
    body,
    argv: [process.execPath, ...nodeArgs],
  };
}

export function deliverArgs(jobId, inputs, extra = []) {
  const args = ["--job", jobId];
  if (inputs.before) args.push("--before", inputs.before);
  if (inputs.after) args.push("--after", inputs.after);
  if (inputs.used) args.push("--used", inputs.used);
  if (inputs.job) args.push("--job-file", inputs.job);
  if (inputs.outDir) args.push("--out-dir", inputs.outDir);
  args.push(...extra);
  return args;
}

export function flagFile(dir) {
  return join(dir, "d15-freeze-flag.json");
}

export function readFlag(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function splitPrepareExecute({ root, jobId, inputs, mutate }) {
  const kit = await import(pathToFileURL(join(root, "server/paid-useful-jobs/lib/delivery-kit.mjs")).href);
  const orderMod = await import(
    pathToFileURL(join(root, "tools/managed-useful-jobs-order/lib/create-order.mjs")).href
  );
  const { loadDeliveryCatalog } = await import(
    pathToFileURL(join(root, "server/paid-useful-jobs/lib/delivery-catalog.mjs")).href
  );
  const deliveryCatalog = loadDeliveryCatalog();
  const preOut = mkdtempSync(join(tmpdir(), "d15-final-split-pre-"));
  const pre = await kit.runPreflightStage({
    jobId,
    inputs,
    catalog: deliveryCatalog,
    outDir: preOut,
  });
  if (typeof mutate === "function") mutate(pre);
  if (!pre?.ok) return { pre, order: null };
  const store = orderMod.defaultFileStore(mkdtempSync(join(tmpdir(), "d15-final-split-store-")));
  const published = mkdtempSync(join(tmpdir(), "d15-final-split-pub-"));
  const raw = kit.orderRequestFromPreflight(pre, {
    orderId: `ord-split-${Date.now()}`,
    catalog: deliveryCatalog,
  });
  const order = await orderMod.runCreateOrder(raw, {
    store,
    outDir: published,
    catalog: deliveryCatalog,
  });
  return { pre, order, published, raw };
}
