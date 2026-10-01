import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ERROR_CODES, parseTerms } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(root, "fixtures/negatives", name), "utf8"));
}

const seeded: Array<{ file: string; code: string; path0?: string }> = [
  { file: "float-reward.json", code: ERROR_CODES.FLOAT_REWARD, path0: "reward" },
  { file: "missing-verifier-version.json", code: ERROR_CODES.MISSING_VERIFIER_VERSION },
  { file: "max-corrections-absent.json", code: ERROR_CODES.UNBOUNDED_CORRECTIONS },
  { file: "max-corrections-negative.json", code: ERROR_CODES.UNBOUNDED_CORRECTIONS },
  { file: "missing-reservation-duration.json", code: ERROR_CODES.MISSING_RESERVATION_DURATION },
  { file: "missing-appeal-route.json", code: ERROR_CODES.MISSING_APPEAL_ROUTE },
  { file: "artifact-executable-payload.json", code: ERROR_CODES.ARTIFACT_EXECUTABLE_PAYLOAD },
];

for (const row of seeded) {
  test(`seeded reject: ${row.file}`, () => {
    const parsed = parseTerms(load(row.file));
    assert.equal(parsed.ok, false, row.file);
    if (parsed.ok) return;
    assert.equal(parsed.code, row.code, `${row.file} code`);
    if (row.path0) {
      assert.equal(parsed.path[0], row.path0);
    }
  });
}
