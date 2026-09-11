import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readByPath } from "./classify.mjs";

function missingKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return [...keys];
  return keys.filter((key) => !Object.prototype.hasOwnProperty.call(obj, key));
}

export function matchCatalogPromise({ engine, stdoutDoc, refuseDoc, outcome, outDir }) {
  const mismatches = [];
  if (outcome.kind === "refused") {
    const missing = missingKeys(refuseDoc, engine.refuse.requiredKeys);
    if (missing.length) {
      mismatches.push({ where: "refuse", missing });
    }
    if (engine.refuse.stream === "stderr" && stdoutDoc && stdoutDoc.ok === true) {
      mismatches.push({ where: "refuse-stream", message: "expected refusal on stderr, got ok stdout" });
    }
    return { ok: mismatches.length === 0, mismatches, outputs: [] };
  }

  const stdoutMissing = missingKeys(stdoutDoc, engine.stdout.requiredKeys);
  if (stdoutMissing.length) {
    mismatches.push({ where: "stdout", missing: stdoutMissing });
  }

  const outputs = engine.outputs.map((spec) => {
    const path = join(outDir, spec.name);
    const exists = existsSync(path);
    if (!exists) {
      mismatches.push({ where: "output-missing", name: spec.name });
      return { name: spec.name, path, exists: false };
    }
    if (spec.schema) {
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
      } catch (err) {
        mismatches.push({ where: "output-json", name: spec.name, error: String(err.message || err) });
        return { name: spec.name, path, exists: true };
      }
      const schemaValue = spec.schemaPath ? readByPath(parsed, spec.schemaPath) : parsed.schema;
      if (schemaValue !== spec.schema) {
        mismatches.push({
          where: "output-schema",
          name: spec.name,
          expected: spec.schema,
          actual: schemaValue ?? null,
        });
      }
      const reqMissing = missingKeys(parsed, spec.requiredKeys || []);
      if (reqMissing.length) {
        mismatches.push({ where: "output-keys", name: spec.name, missing: reqMissing });
      }
    }
    return { name: spec.name, path, exists: true };
  });

  return { ok: mismatches.length === 0, mismatches, outputs };
}
