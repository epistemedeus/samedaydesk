import { existsSync } from "node:fs";
import { PACKS } from "../lib/pins.mjs";
import { envelope, failError } from "../lib/envelope.mjs";
import { verifyLocalArchive } from "../lib/hash.mjs";
import { digestResult, makeReceipt } from "../lib/receipt.mjs";
import { currentPin, inputDigestFor } from "../lib/stale.mjs";
import { readJson, rel } from "../lib/repo.mjs";
import { parseStdoutJson, runNode } from "../lib/spawn.mjs";

function fail(evidence, message, detail) {
  return envelope({
    ok: false,
    command: "run",
    job: "packs",
    evidence,
    error: failError("PACK", message, detail),
  });
}

function checkArchive(root, spec, discoveryShaField = "sha256") {
  const archivePath = rel(root, spec.kitArchive);
  const discoveryPath = rel(root, spec.discovery);
  if (!existsSync(archivePath) || !existsSync(discoveryPath)) {
    return { ok: false, error: `missing archive or discovery for ${spec.id}` };
  }
  const hashed = verifyLocalArchive(archivePath, spec.sha256, spec.bytes);
  const discovery = readJson(discoveryPath);
  const disc = discovery.archive || discovery;
  const discSha = disc.sha256 || discovery[discoveryShaField];
  const discBytes = disc.bytes || discovery.bytes;
  if (!hashed.ok) return { ok: false, hashed, error: `kit hash mismatch for ${spec.id}` };
  if (discSha !== spec.sha256 || Number(discBytes) !== spec.bytes) {
    return {
      ok: false,
      hashed,
      error: `discovery sha/bytes mismatch for ${spec.id}`,
      discovery: { sha256: discSha, bytes: discBytes },
    };
  }
  return { ok: true, hashed, discovery: { sha256: discSha, bytes: discBytes, packageId: discovery.packageId } };
}

export async function runPacks(ctx) {
  const { root, dryRun = false, clock } = ctx;
  const evidence = [];

  if (dryRun) {
    return envelope({
      ok: true,
      command: "run",
      job: "packs",
      dryRun: true,
      evidence: [
        {
          kind: "argv",
          argv: [
            "node",
            PACKS.distributionRepair.inTreeBin,
            ...PACKS.distributionRepair.sampleArgv,
          ],
        },
      ],
      result: {
        would: [
          "hash record-repeat kit",
          "hash distribution-repair kit",
          "hash consumer-repeat kit",
          "run distribution-repair sample --positive",
        ],
      },
    });
  }

  const rr = checkArchive(root, PACKS.recordRepeat);
  evidence.push({ kind: "archive", id: PACKS.recordRepeat.id, ...(rr.hashed || {}), ok: rr.ok });
  if (!rr.ok) return fail(evidence, rr.error, rr);

  const dr = checkArchive(root, PACKS.distributionRepair);
  evidence.push({ kind: "archive", id: PACKS.distributionRepair.id, ...(dr.hashed || {}), ok: dr.ok });
  if (!dr.ok) return fail(evidence, dr.error, dr);

  const cr = checkArchive(root, PACKS.consumerRepeat);
  evidence.push({ kind: "archive", id: PACKS.consumerRepeat.id, ...(cr.hashed || {}), ok: cr.ok });
  if (!cr.ok) return fail(evidence, cr.error, cr);

  const pinPath = rel(root, PACKS.recordRepeat.pinFile);
  const binPath = rel(root, PACKS.recordRepeat.inTreeBin);
  if (!existsSync(binPath) || !existsSync(pinPath)) {
    return fail(evidence, "in-tree record-repeat bin or PIN.json missing");
  }
  const pin = readJson(pinPath);
  if (pin.parserPin !== PACKS.recordRepeat.parserPin || pin.recipePin !== PACKS.recordRepeat.recipePin) {
    return fail(evidence, "record-repeat PIN.json does not match discovery parser/recipe pins", {
      expected: {
        parserPin: PACKS.recordRepeat.parserPin,
        recipePin: PACKS.recordRepeat.recipePin,
      },
      actual: { parserPin: pin.parserPin, recipePin: pin.recipePin },
    });
  }
  evidence.push({
    kind: "record-repeat-pin",
    parserPin: pin.parserPin,
    recipePin: pin.recipePin,
  });

  const sampleBin = rel(root, PACKS.distributionRepair.inTreeBin);
  if (!existsSync(sampleBin)) return fail(evidence, "distribution-repair CLI missing");
  const sample = runNode(sampleBin, [...PACKS.distributionRepair.sampleArgv], {
    cwd: root,
    timeoutMs: 30_000,
  });
  const parsed = parseStdoutJson(sample.stdout);
  evidence.push({
    kind: "sample",
    pack: "distribution-repair",
    argv: sample.argv,
    status: sample.status,
    parseOk: parsed.ok,
  });
  if (sample.status !== 0 || !parsed.ok || parsed.value?.ok !== true) {
    return fail(evidence, "distribution-repair sample --positive did not return ok:true", {
      status: sample.status,
      stderr: (sample.stderr || "").slice(0, 500),
    });
  }

  const result = {
    recordRepeat: rr.hashed,
    distributionRepair: { ...dr.hashed, sampleOk: true, sampleStatus: parsed.value.status || "diagnosed" },
    consumerRepeat: cr.hashed,
    paymentSent: false,
  };
  const receipt = makeReceipt({
    jobId: "packs",
    clock,
    pin: currentPin(),
    inputDigest: inputDigestFor("packs", root),
    resultDigest: digestResult(result),
    ok: true,
  });
  return envelope({
    ok: true,
    command: "run",
    job: "packs",
    evidence,
    result,
    receipt,
  });
}
