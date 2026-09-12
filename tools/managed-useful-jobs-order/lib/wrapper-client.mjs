import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OrderRefuse } from "./errors.mjs";
import { REPO_ROOT } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PIN = JSON.parse(readFileSync(join(here, "d01-pin.json"), "utf8"));

function repoHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  return String(r.stdout || "").trim() || PIN.testedD01Sha;
}

export const TESTED_D01_SHA = repoHead();
export const TESTED_PR52_SHA = PIN.packetPinPr52;
export const EXECUTION_CONTRACT_PIN = PIN.contract;

const KNOWN_D01_WORKTREE = "/tmp/ro-worktrees/sds-d01/server/paid-useful-jobs";

export function defaultWrapperRoot() {
  const env = process.env.MANAGED_ORDER_WRAPPER_ROOT;
  if (env) return env;
  const inRepo = join(REPO_ROOT, "server/paid-useful-jobs");
  if (existsSync(join(inRepo, "index.mjs"))) return inRepo;
  if (existsSync(join(KNOWN_D01_WORKTREE, "index.mjs"))) return KNOWN_D01_WORKTREE;
  return inRepo;
}

function asContract(mod, { wrapperRoot, executeUrl = null } = {}) {
  const version = mod.EXECUTION_CONTRACT_VERSION || null;
  const run =
    typeof mod.createExecutor === "function" ? mod.createExecutor() : mod.runPaidOffer;
  if (typeof run !== "function") {
    throw new OrderRefuse(
      "missing-execution-contract",
      "D01 module does not export createExecutor or runPaidOffer",
      { detail: { wrapperRoot, keys: Object.keys(mod), testedD01Sha: TESTED_D01_SHA } },
    );
  }
  return {
    kind: executeUrl ? "http" : "library",
    version: version || EXECUTION_CONTRACT_PIN,
    wrapperRoot,
    executeUrl,
    testedD01Sha: TESTED_D01_SHA,
    testedPr52Sha: TESTED_PR52_SHA,
    classifyFunding: typeof mod.classifyFunding === "function" ? mod.classifyFunding : null,
    createExecutor: typeof mod.createExecutor === "function" ? mod.createExecutor : null,
    async runPaidOffer(request) {
      if (executeUrl) {
        const origin = executeUrl.replace(/\/$/, "");
        const executionId = request.executionId || randomUUID();
        const payload = { ...request, executionId };
        let res;
        try {
          res = await fetch(`${origin}/execute`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          const recovered = await fetch(`${origin}/results/${encodeURIComponent(executionId)}`);
          if (recovered.ok) return recovered.json();
          throw new OrderRefuse("engine-crash", "D01 /execute failed and result was not recoverable", {
            httpStatus: 503,
            detail: { executionId, error: String(err?.message || err) },
          });
        }
        let body;
        try {
          body = await res.json();
        } catch (err) {
          const recovered = await fetch(`${origin}/results/${encodeURIComponent(executionId)}`);
          if (recovered.ok) return recovered.json();
          throw new OrderRefuse("invalid-json", "D01 /execute did not return JSON", {
            detail: { status: res.status, error: String(err?.message || err), executionId },
          });
        }
        if (res.status === 400 && body?.code === "invalid-json") {
          throw new OrderRefuse("invalid-json", body.error || "D01 rejected invalid JSON", {
            detail: { httpStatus: 400, contract: body.contract || version },
          });
        }
        return body;
      }
      return run(request);
    },
  };
}

/**
 * Resolve the D01 execution contract. Does not vendor wrapper.mjs.
 * Library import is the default; --execute-url / MANAGED_ORDER_EXECUTE_URL is a thin HTTP consumer.
 */
export async function loadExecutionContract(options = {}) {
  if (options.wrapper && typeof options.wrapper.runPaidOffer === "function") {
    return options.wrapper;
  }
  const executeUrl = options.executeUrl || process.env.MANAGED_ORDER_EXECUTE_URL || null;
  const wrapperRoot = options.wrapperRoot || process.env.MANAGED_ORDER_WRAPPER_ROOT || defaultWrapperRoot();
  const indexPath = join(wrapperRoot, "index.mjs");
  if (!existsSync(indexPath)) {
    throw new OrderRefuse(
      "missing-execution-contract",
      "D01 paid-useful-jobs execution contract is not on this tree; set MANAGED_ORDER_WRAPPER_ROOT to the D01 worktree",
      {
        detail: {
          wrapperRoot,
          indexPath,
          testedD01Sha: TESTED_D01_SHA,
          packetPinPr52: TESTED_PR52_SHA,
        },
      },
    );
  }
  const mod = await import(pathToFileURL(indexPath).href);
  return asContract(mod, { wrapperRoot, executeUrl });
}
