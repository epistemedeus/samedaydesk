import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, jobDocument } from "./corpus.mjs";
import { CASES_ROOT } from "./paths.mjs";

export function materializeCases(root = CASES_ROOT) {
  const written = [];
  for (const caseDef of CASES) {
    const dir = join(root, caseDef.id);
    mkdirSync(dir, { recursive: true });
    const before = caseDef.before();
    const after = caseDef.after();
    const job = jobDocument(caseDef);
    writeFileSync(join(dir, "before.json"), `${JSON.stringify(before, null, 2)}\n`);
    writeFileSync(join(dir, "after.json"), `${JSON.stringify(after, null, 2)}\n`);
    writeFileSync(join(dir, "job.json"), `${JSON.stringify(job, null, 2)}\n`);
    writeFileSync(join(dir, "expected.json"), `${JSON.stringify(caseDef.expected, null, 2)}\n`);
    written.push(dir);
  }
  return written;
}
