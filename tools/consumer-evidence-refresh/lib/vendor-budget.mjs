import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ensurePr51Kit, parseEngineJson } from "./kit.mjs";
import { PR51_CLI, VENDOR_BUDGET_JOB } from "./pins.mjs";

/**
 * Optional PR51 vendor-budget-impact input class (customer quantities).
 * Reuses the committed useful-jobs archive. Does not import F08 wrappers.
 */
export function runVendorBudgetClass({ before, after, timeoutMs = 120_000 } = {}) {
  if (!before || !after || !existsSync(before) || !existsSync(after)) {
    return {
      ok: false,
      refused: true,
      code: "missing_vendor_budget_inputs",
      message: "vendor-budget-impact requires redacted before and after quantity files",
      purchaseAuthority: false,
      sold: false,
    };
  }
  const kit = ensurePr51Kit();
  const cli = join(kit, PR51_CLI);
  const outDir = mkdtempSync(join(tmpdir(), "cer-vendor-budget-"));
  mkdirSync(outDir, { recursive: true });
  const args = ["run", VENDOR_BUDGET_JOB, "--before", before, "--after", after, "--out-dir", outDir];
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: kit,
  });
  const json = parseEngineJson(result.stdout);
  return {
    ok: result.status === 0 && json?.ok !== false,
    inputClass: VENDOR_BUDGET_JOB,
    kind: "customer_quantities",
    status: typeof json?.status === "string" ? json.status : "unknown",
    digest: json?.digest || null,
    purchaseAuthority: false,
    sold: false,
    paymentAttempted: false,
    engineOk: json?.ok !== false,
    outDir,
    json,
    statusCode: result.status,
    stderr: result.stderr || "",
  };
}
