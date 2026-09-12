import { existsSync } from "node:fs";

export function classifyCold(run, { advertisedOutputs = [], outDir = null } = {}) {
  const body = run.json || {};
  const code = body.code || body.error || null;
  const codeText = typeof code === "string" ? code : "";
  const refused =
    run.status === 2 ||
    body.refused === true ||
    (typeof codeText === "string" &&
      /refus|missing-required|html-input|sample_as_delivered|mismatch|not-this-job|homepage_rewrite|input-digest|live_fetch|clock_required|unrecognized_batch/i.test(
        codeText,
      ));
  const crashed =
    run.status !== 0 &&
    run.status !== 2 &&
    (run.spawnError ||
      run.signal ||
      body.code === "engine-crash" ||
      /Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND/.test(`${run.stdout}${run.stderr}`));
  const processSuccess = run.status === 0 && body.ok !== false;
  const analysisStatus =
    body.status ||
    body.report?.verdict ||
    body.report?.snapshot?.verdict ||
    body.analysis?.status ||
    null;
  const missingOutputs = [];
  if (outDir && advertisedOutputs.length && processSuccess) {
    for (const name of advertisedOutputs) {
      if (!existsSync(`${outDir}/${name}`)) missingOutputs.push(name);
    }
  }
  let kind = "process-success";
  if (run.timedOut) kind = "timeout";
  else if (crashed) kind = "defect-crash";
  else if (refused && run.status === 2) kind = "supported-refusal";
  else if (processSuccess && missingOutputs.length) kind = "defect-missing-output";
  else if (processSuccess) kind = "process-success";
  else kind = "unclassified-failure";
  return {
    kind,
    processSuccess,
    analysisStatus,
    refused: Boolean(refused && run.status === 2),
    code: codeText || body.code || null,
    missingOutputs,
    purchaseAuthority: body.purchaseAuthority === true,
    provenance: body.provenance || body.report?.provenance || null,
    outDir: body.outDir || body.written?.jsonPath || outDir || null,
    digest: body.digest || body.report?.provenance?.digestSha256 || null,
    fixtureFunding: Boolean(body.example || body.sample || body.provenance === "fixture"),
    payment: body.payment || null,
  };
}
