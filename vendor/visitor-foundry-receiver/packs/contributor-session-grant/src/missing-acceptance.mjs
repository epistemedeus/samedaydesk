import { existsSync } from "node:fs";
import { join } from "node:path";

/** PR109 draft. Not merged. This checkout does not fetch, compile, or boot it. */
export const KERNEL_ACCEPTANCE = Object.freeze({
  repo: "epistemedeus/neomorphic-io",
  pr: 109,
  draft: true,
  state: "OPEN",
  sha: "c4048401fa42e1272e61edf983afbf39a3e04555",
  tree: "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd",
  path: "services/earned-work",
  observedAt: "2026-09-22T16:24:21Z",
});

export function missingKernelAcceptance(repoRoot) {
  const kernelDir = join(repoRoot, KERNEL_ACCEPTANCE.path);
  return {
    accepted: false,
    presentOnCheckout: existsSync(kernelDir),
    contacted: false,
    booted: false,
    ...KERNEL_ACCEPTANCE,
    reason:
      "neomorphic-io#109 is an open draft. It is not on main. This pack does not run prepare-e01 or boot the kernel.",
  };
}
