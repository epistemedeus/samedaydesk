import { lstatSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";

let done = false;

function applyOp(op) {
  if (!op || !op.target) return;
  if (op.kind === "overwrite") {
    writeFileSync(op.target, readFileSync(op.overlay));
    return;
  }
  if (op.kind === "symlink") {
    try {
      unlinkSync(op.target);
    } catch {
      /* missing is fine */
    }
    symlinkSync(op.overlay, op.target);
  }
}

export function mutateAfterPrepare() {
  if (process.env.D15_FREEZE_ONCE !== "0" && done) return;
  const planPath = process.env.D15_FREEZE_PLAN;
  if (!planPath) return;
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  for (const op of plan.ops || []) applyOp(op);
  done = true;
  const flagPath = process.env.D15_FREEZE_FLAG;
  if (flagPath) {
    const kinds = (plan.ops || []).map((op) => op.kind);
    const live = (plan.ops || []).map((op) => {
      let symlink = false;
      try {
        symlink = lstatSync(op.target).isSymbolicLink();
      } catch {
        symlink = false;
      }
      return { kind: op.kind, target: op.target, symlink };
    });
    writeFileSync(flagPath, `${JSON.stringify({ mutated: true, kinds, live }, null, 2)}\n`);
  }
}

