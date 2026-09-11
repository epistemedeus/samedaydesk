import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../lib/cases.mjs";
import { CASES_ROOT } from "../lib/paths.mjs";

function stripDocuments(caseDef) {
  const {
    before,
    after,
    ...meta
  } = caseDef;
  return { meta, before, after };
}

for (const caseDef of CASES) {
  const { meta, before, after } = stripDocuments(caseDef);
  const dir = join(CASES_ROOT, caseDef.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(dir, "before.json"), `${JSON.stringify(before, null, 2)}\n`);
  writeFileSync(join(dir, "after.json"), `${JSON.stringify(after, null, 2)}\n`);
}

writeFileSync(join(CASES_ROOT, "INDEX.json"), `${JSON.stringify({
  count: CASES.length,
  ids: CASES.map((item) => item.id),
}, null, 2)}\n`);

process.stdout.write(`materialized ${CASES.length} snapshot cases under ${CASES_ROOT}\n`);
