import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCorpus } from "./load-corpus.mjs";
import { runWrapperCli } from "./run-wrapper.mjs";
import { classifyRun, loadCaseArtifact } from "./outcome.mjs";
import { compareDomain, domainView } from "./compare.mjs";
import { enginePin } from "./pins.mjs";
import { CorpusRefuse } from "./errors.mjs";

function rejection(err) {
  return {
    ok: false,
    refused: true,
    code: err.code || "corpus-refused",
    error: err.message,
    detail: err.detail || null,
    enginePin: enginePin(),
    sold: false,
    purchaseAuthority: false,
  };
}

export function validateCorpus(input) {
  try {
    const corpus = loadCorpus(input);
    return {
      ok: true,
      schema: corpus.schema,
      id: corpus.id,
      cases: corpus.cases.map((c) => ({
        id: c.id,
        jobId: c.jobId,
        independentlyValidCaller: c.independentlyValidCaller,
        sample: c.sample,
      })),
      enginePin: enginePin(),
    };
  } catch (err) {
    if (err instanceof CorpusRefuse) return rejection(err);
    throw err;
  }
}

export function runCorpus(input, { outDir } = {}) {
  let corpus;
  try {
    corpus = loadCorpus(input);
  } catch (err) {
    if (err instanceof CorpusRefuse) return rejection(err);
    throw err;
  }

  const work = outDir;
  if (work) mkdirSync(work, { recursive: true });

  const results = [];
  for (const item of corpus.cases) {
    const caseOut = work ? join(work, item.id) : undefined;
    const wrapper = runWrapperCli({
      jobId: item.jobId,
      files: item.files,
      example: false,
      funding: "unfunded",
      outDir: caseOut,
    });
    const artifact = loadCaseArtifact(caseOut, item.outputs);
    const outcome = classifyRun({ wrapper, artifact, sample: false });
    const domain = domainView(artifact, { jobId: item.jobId, analysis: outcome.analysis });
    results.push({
      id: item.id,
      jobId: item.jobId,
      independentlyValidCaller: item.independentlyValidCaller && outcome.independentlyValidCaller,
      sample: false,
      sold: wrapper.json?.sold === true,
      purchaseAuthority: wrapper.json?.purchaseAuthority === true,
      wrapperStatus: wrapper.status,
      fundingState: wrapper.json?.fundingState || null,
      ...outcome,
      domain,
      outputs: wrapper.json?.outputs || [],
      engineDigest: wrapper.json?.engine?.digest || wrapper.json?.receipt?.engineResult?.digest || null,
      outputsDigest: wrapper.json?.receipt?.outputsDigest || null,
    });
  }

  const comparisons = [];
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const left = results[i];
      const right = results[j];
      if (left.domain?.jobId !== right.domain?.jobId) continue;
      if (left.analysis === "failed" || right.analysis === "failed") continue;
      comparisons.push({
        a: left.id,
        b: right.id,
        jobId: left.jobId,
        ...compareDomain(left.domain, right.domain),
      });
    }
  }

  const report = {
    ok: results.every((r) => r.transportOk && r.analysis !== "failed"),
    schema: corpus.schema,
    id: corpus.id,
    sold: false,
    purchaseAuthority: false,
    enginePin: enginePin(),
    results,
    comparisons,
    outDir: work || null,
  };
  if (work) {
    writeFileSync(join(work, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export function compareCases(input, idA, idB) {
  const report = runCorpus(input);
  if (!report.ok && report.refused) return report;
  const a = report.results.find((r) => r.id === idA);
  const b = report.results.find((r) => r.id === idB);
  if (!a || !b) {
    return rejection({
      code: "missing-case",
      message: `Need cases ${idA} and ${idB}`,
      detail: { have: (report.results || []).map((r) => r.id) },
    });
  }
  return {
    ok: true,
    enginePin: enginePin(),
    a: { id: a.id, analysis: a.analysis, domain: a.domain, engineDigest: a.engineDigest },
    b: { id: b.id, analysis: b.analysis, domain: b.domain, engineDigest: b.engineDigest },
    domain: compareDomain(a.domain, b.domain),
    digestEqual: a.engineDigest && b.engineDigest ? a.engineDigest === b.engineDigest : null,
  };
}
