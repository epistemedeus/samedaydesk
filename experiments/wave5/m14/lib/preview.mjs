import { existsSync, readFileSync } from "node:fs";
import { classifyResult, LAYER } from "./classify.mjs";
import { jobGuide, limitsFor, testedRecord } from "./jobs-guide.mjs";
import { PREVIEW_SCHEMA } from "./paths.mjs";

const MARKDOWN_LIMIT = 800;
const JSON_LIMIT = 1200;

function excerpt(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) return { text: value, truncated: false, bytes: Buffer.byteLength(value) };
  return {
    text: value.slice(0, limit),
    truncated: true,
    bytes: Buffer.byteLength(value),
    omittedBytes: Buffer.byteLength(value) - Buffer.byteLength(value.slice(0, limit)),
  };
}

function readOutput(outputs, name) {
  const row = (outputs || []).find((o) => o && o.name === name);
  if (!row?.path || !existsSync(row.path)) return null;
  const raw = readFileSync(row.path, "utf8");
  return { name, path: row.path, sha256: row.sha256 || null, bytes: row.bytes ?? Buffer.byteLength(raw), raw };
}

function headline(classified, artifact) {
  if (classified.layer === LAYER.WRAPPER_REFUSE) {
    return classified.error || "Wrapper refused before the engine ran.";
  }
  if (classified.layer === LAYER.TRANSPORT_FAILURE) {
    return classified.error || "Engine or kit transport failed. This is not an analysis report.";
  }
  if (classified.layer === LAYER.INCOMPLETE_DELIVERY) {
    return `Expected files missing: ${(classified.delivery.missing || []).join(", ")}`;
  }
  if (artifact?.json?.summary) return artifact.json.summary;
  if (classified.report?.status) return `Engine status ${classified.report.status}`;
  return "Run completed.";
}

function usefulnessNote(classified) {
  if (classified.layer === LAYER.USEFUL_DELIVERY) {
    const outcome = classified.analysis?.outcome;
    if (outcome === "refused") return "Valid analysis refusal with delivered artifacts. Not a crash.";
    if (outcome === "informational") return "Useful no-change or informational report. Transport succeeded.";
    if (outcome === "partial") return "Partial report. Treat findings as non-final.";
    if (outcome === "actionable") return "Actionable report from the inspected inputs.";
    return "Delivered analysis artifacts.";
  }
  if (classified.layer === LAYER.WRAPPER_REFUSE) return "No analysis ran. Fix the input or job id and retry.";
  if (classified.layer === LAYER.TRANSPORT_FAILURE) return "Do not treat this as a domain refusal or no-change report.";
  if (classified.layer === LAYER.INCOMPLETE_DELIVERY) return "Do not treat a partial file set as complete delivery.";
  return "Engine did not produce a usable report.";
}

export function buildPreview(result, { jobId = result?.jobId, outDir = null } = {}) {
  const classified = classifyResult(result, { jobId });
  const guide = jobId && classified.job ? jobGuide(jobId) : null;
  const mdName = (guide?.outputs || []).find((n) => n.endsWith(".md"));
  const jsonName = (guide?.outputs || []).find((n) => n.endsWith(".json"));
  const mdFile = mdName ? readOutput(result?.outputs, mdName) : null;
  const jsonFile = jsonName ? readOutput(result?.outputs, jsonName) : null;
  let artifactJson = null;
  if (jsonFile?.raw) {
    try {
      artifactJson = JSON.parse(jsonFile.raw);
    } catch {
      artifactJson = null;
    }
  }
  const hashes = classified.hashes || {
    engineDigest: classified.report?.digest || null,
    inputsDigest: result?.receipt?.inputsDigest || null,
    outputsDigest: result?.receipt?.outputsDigest || null,
    firstOutputSha256: result?.outputs?.[0]?.sha256 || null,
  };

  return {
    schema: PREVIEW_SCHEMA,
    ok: classified.useful,
    layer: classified.layer,
    jobId: jobId || null,
    title: guide?.title || result?.title || null,
    testedImplementation: testedRecord(),
    transport: classified.transport,
    analysis: classified.analysis,
    delivery: classified.delivery,
    payment: classified.payment,
    wrapper: {
      ok: result?.ok === true,
      code: result?.code || classified.code || null,
      error: result?.error || classified.error || null,
      contract: result?.contract || null,
    },
    headline: headline(classified, { json: artifactJson }),
    usefulness: usefulnessNote(classified),
    limits: jobId ? limitsFor(jobId) : [],
    hashes,
    unlikeHashes: unlikeHashPairs(hashes),
    artifacts: {
      outDir: outDir || result?.receipt?.outDir || result?.outDir || null,
      markdown: mdFile
        ? {
            name: mdFile.name,
            sha256: mdFile.sha256,
            bytes: mdFile.bytes,
            excerpt: excerpt(mdFile.raw, MARKDOWN_LIMIT),
          }
        : null,
      json: jsonFile
        ? {
            name: jsonFile.name,
            sha256: jsonFile.sha256,
            bytes: jsonFile.bytes,
            excerpt: excerpt(jsonFile.raw, JSON_LIMIT),
            status: artifactJson?.status || null,
            summary: artifactJson?.summary || null,
            actions: Array.isArray(artifactJson?.actions) ? artifactJson.actions.slice(0, 8) : [],
            truncatedActions: Array.isArray(artifactJson?.actions) && artifactJson.actions.length > 8,
          }
        : null,
    },
    source: classified.source,
  };
}

function unlikeHashPairs(hashes) {
  const named = [
    ["engineDigest", hashes.engineDigest],
    ["inputsDigest", hashes.inputsDigest],
    ["outputsDigest", hashes.outputsDigest],
    ["firstOutputSha256", hashes.firstOutputSha256],
  ].filter(([, v]) => typeof v === "string" && v.length > 0);
  const unequal = [];
  for (let i = 0; i < named.length; i += 1) {
    for (let j = i + 1; j < named.length; j += 1) {
      if (named[i][1] !== named[j][1]) {
        unequal.push({ a: named[i][0], b: named[j][0] });
      }
    }
  }
  return unequal;
}

export function renderPreviewText(preview) {
  const lines = [];
  lines.push(`# ${preview.title || preview.jobId || "Result preview"}`);
  lines.push("");
  lines.push(`Job: ${preview.jobId || "(unknown)"}`);
  lines.push(`Layer: ${preview.layer}`);
  lines.push(`Transport: ${preview.transport}`);
  lines.push(`Analysis: ${preview.analysis?.status || "not-run"} (${preview.analysis?.outcome || "not-run"})`);
  const present = preview.delivery?.present || [];
  const missing = preview.delivery?.missing || [];
  lines.push(`Delivery: ${preview.delivery?.status || "unknown"} complete=${preview.delivery?.complete === true}`);
  if (present.length) lines.push(`Present: ${present.join(", ")}`);
  if (missing.length) lines.push(`Missing: ${missing.join(", ")}`);
  lines.push(
    `Payment: fundingState=${preview.payment?.fundingState} sold=${preview.payment?.sold === true} sample=${preview.payment?.sample === true} liveSettlement=${preview.payment?.liveSettlement}`,
  );
  lines.push("");
  lines.push(preview.headline);
  lines.push(preview.usefulness);
  if (preview.artifacts?.json?.summary) {
    lines.push("");
    lines.push("## Artifact");
    lines.push(preview.artifacts.json.summary);
    for (const action of preview.artifacts.json.actions || []) {
      const label = action.kind || action.priority || "action";
      const note = action.note || action.fieldKey || action.key || "";
      lines.push(`- ${label}${note ? `: ${note}` : ""}`);
    }
    if (preview.artifacts.json.truncatedActions) lines.push("- Additional actions omitted from this preview.");
  }
  if (preview.artifacts?.markdown?.excerpt?.text) {
    lines.push("");
    lines.push("## Markdown excerpt");
    lines.push(preview.artifacts.markdown.excerpt.text);
    if (preview.artifacts.markdown.excerpt.truncated) {
      lines.push("");
      lines.push(`Markdown truncated after ${MARKDOWN_LIMIT} characters. Read ${preview.artifacts.markdown.name} for the full file.`);
    }
  }
  if (preview.hashes) {
    lines.push("");
    lines.push("## Hashes (unlike values stay unlike)");
    if (preview.hashes.engineDigest) lines.push(`engine.digest: ${preview.hashes.engineDigest}`);
    if (preview.hashes.inputsDigest) lines.push(`receipt.inputsDigest: ${preview.hashes.inputsDigest}`);
    if (preview.hashes.outputsDigest) lines.push(`receipt.outputsDigest: ${preview.hashes.outputsDigest}`);
    if (preview.hashes.firstOutputSha256) {
      lines.push(`first output sha256: ${preview.hashes.firstOutputSha256}`);
    }
  }
  if (preview.limits?.length) {
    lines.push("");
    lines.push("## Limits");
    for (const limit of preview.limits) lines.push(`- ${limit}`);
  }
  lines.push("");
  lines.push(`Tested wrapper: ${preview.testedImplementation?.sha} (${preview.testedImplementation?.ref} PR${preview.testedImplementation?.pr})`);
  return `${lines.join("\n")}\n`;
}
