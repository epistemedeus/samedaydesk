import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertImmutable, writeSequencedArtifact } from "./prior.mjs";
import { runSourceChangeAlert, META as SOURCE_CHANGE_META } from "../recipes/source-change-alert.mjs";
import {
  runComparableRecordExtraction,
  META as RECORD_META,
} from "../recipes/comparable-record-extraction.mjs";
import { runVerificationReconcile, META as VERIFY_META } from "../recipes/verification-reconcile.mjs";
import { sha256Hex, stableStringify } from "./hash.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(here, "..");
export const FIXTURES_DIR = join(PACKAGE_ROOT, "fixtures");

export const RECIPES = Object.freeze({
  "source-change-alert": {
    meta: SOURCE_CHANGE_META,
    run: runSourceChangeAlert,
  },
  "comparable-record-extraction": {
    meta: RECORD_META,
    run: runComparableRecordExtraction,
  },
  "verification-reconcile": {
    meta: VERIFY_META,
    run: runVerificationReconcile,
  },
});

export function listRecipes() {
  return Object.values(RECIPES).map((entry) => entry.meta);
}

export async function runRecipe(recipeId, input = {}) {
  const entry = RECIPES[recipeId];
  if (!entry) {
    return {
      ok: false,
      outcome: "error",
      recipeId,
      evidence: {
        kind: "error",
        code: "unknown_recipe",
        message: `unknown recipe: ${recipeId}`,
      },
    };
  }
  return entry.run(input);
}

export function persistResult(result, { outDir, writeArtifact = false } = {}) {
  if (!outDir) return { ok: true, skipped: true };
  mkdirSync(outDir, { recursive: true });
  const stamp = (result.clock || new Date().toISOString()).replace(/[:.]/g, "-");
  const reportPath = join(outDir, `${result.recipeId}.${stamp}.result.json`);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(reportPath, text);

  let artifact = null;
  if (writeArtifact) {
    const sequence = (result.prior?.sequence || 0) + 1;
    const body = {
      schema: "samedaydesk.recurring-job-prior.v1",
      recipeId: result.recipeId,
      createdAt: result.clock,
      sequence,
      immutable: true,
      sha256: sha256Hex(stableStringify(result.evidence)),
      payload: {
        evidence: result.evidence,
        outcome: result.outcome,
      },
      payment: { attempted: false },
    };
    const priorPath = result.prior?.path;
    if (priorPath) {
      const guard = assertImmutable(priorPath, `${stableStringify(body)}\n`);
      if (!guard.ok) {
        return { ok: false, reportPath, ...guard };
      }
    }
    artifact = writeSequencedArtifact(outDir, result.recipeId, sequence, body);
  }

  return { ok: true, reportPath, artifact };
}
