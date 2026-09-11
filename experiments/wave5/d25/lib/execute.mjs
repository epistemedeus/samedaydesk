import { resolve } from "node:path";
import { D01_CLI, D01_PAYMENT, REPO_ROOT } from "./repo.mjs";
import { parseJsonStdout, runNode } from "./spawn.mjs";

export function runPaidCli({
  jobId,
  inputs = {},
  example = false,
  funding,
  paymentPath,
  outDir,
  extraArgs = [],
} = {}) {
  const args = [D01_CLI, "run", jobId];
  if (example) args.push("--example");
  for (const [key, value] of Object.entries(inputs)) {
    if (value == null || value === false || value === "") continue;
    args.push(`--${key}`, resolve(String(value)));
  }
  if (funding) args.push("--funding", String(funding));
  if (paymentPath) args.push("--payment", resolve(String(paymentPath)));
  if (outDir) args.push("--out-dir", resolve(String(outDir)));
  args.push(...extraArgs);
  const proc = runNode(args, { cwd: REPO_ROOT });
  const parsed = parseJsonStdout(proc);
  return { proc, parsed, args };
}

export function reservedFixturePaymentPath() {
  return D01_PAYMENT;
}
