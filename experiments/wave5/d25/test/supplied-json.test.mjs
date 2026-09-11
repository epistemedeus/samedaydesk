import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { assert, tmp } from "./helpers.mjs";
import { D01_INDEX } from "../lib/repo.mjs";
import { runNode } from "../lib/spawn.mjs";

describe("supplied JSON through the public library", { timeout: 60_000 }, () => {
  it("inline JSON objects are analyzed as caller input, not SAMPLE", () => {
    const work = tmp("w5-d25-json-");
    const file = join(work, "inline.mjs");
    const href = pathToFileURL(D01_INDEX).href;
    writeFileSync(
      file,
      `import { runPaidOffer } from ${JSON.stringify(href)};
const before = {
  label: "owner-qa",
  note: "Owner QA inline JSON. Not a kit fixture.",
  rows: [{ field: "desk-chat-input", value: 1, unit: "USD/1M-tokens" }]
};
const after = {
  label: "owner-qa",
  note: "Owner QA inline JSON. Not a kit fixture.",
  rows: [{ field: "desk-chat-input", value: 3, unit: "USD/1M-tokens" }]
};
const r = await runPaidOffer({ jobId: "vendor-budget-impact", inputs: { before, after } });
process.stdout.write(JSON.stringify({
  ok: r.ok,
  sample: r.sample,
  sold: r.sold,
  status: r.engine && r.engine.status,
  outputNames: (r.outputs || []).map((o) => o.name),
  inputsDigest: r.receipt && r.receipt.inputsDigest || null
}) + "\\n");
process.exit(r.ok ? 0 : 2);
`,
    );
    const proc = runNode([file]);
    assert.equal(proc.status, 0, proc.stderr + proc.stdout);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.sample, false);
    assert.equal(body.sold, false);
    assert.equal(body.status, "actionable");
    assert.deepEqual(body.outputNames, ["budget-impact.json", "budget-impact.md"]);
    assert.match(body.inputsDigest, /^[0-9a-f]{64}$/);
  });
});
