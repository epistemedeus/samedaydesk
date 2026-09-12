// Explicitly seeded consumer control. The production wrapper is imported intact;
// this fake engine is never used as current engine readiness evidence.
import { createExecutor } from "../../../../server/paid-useful-jobs/lib/wrapper.mjs";
const mode = process.argv[2];
const result = await createExecutor({
  acquireKit: () => process.env.TMPDIR,
  runEngine: () => mode === "transport-failure"
    ? { status: 9, stdout: "", stderr: "CW63 seeded process failure", json: null }
    : { status: 0, stdout: "", stderr: "", json: { ok: true, status: "informational" } },
})({ jobId: "lockfile-pin-delta", inputs: {
  before: "tools/lockfile-pin-delta/fixtures/journey/before.json",
  after: "tools/lockfile-pin-delta/fixtures/journey/before.json",
} });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 2;
