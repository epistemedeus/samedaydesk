import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256File } from "./digest.mjs";
import { readFieldEvidence } from "./field.mjs";
import {
  ARCHIVE_BYTES,
  ARCHIVE_PATH,
  ARCHIVE_SHA256,
  CATALOG_PATH,
  CO03,
  CO17,
  D01_OBSERVED,
  DEFAULT_JOB_ID,
  expectedOutputsFor,
  KIT_SCHEMA,
  RECEIPT_SCHEMA,
  SDS52,
  WRAPPER_CLI,
} from "./pins.mjs";
import { listJobs, runWrapperJob } from "./wrapper-cli.mjs";

function fileMeta(filePath) {
  if (!existsSync(filePath)) return { path: filePath, present: false, sha256: null, bytes: null };
  const buf = readFileSync(filePath);
  return { path: filePath, present: true, sha256: sha256File(filePath), bytes: buf.length };
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function snapshotJob({ jobId, outDir, result, role, inputs }) {
  const expected = expectedOutputsFor(jobId);
  const outputs = expected.map((name) => ({ name, ...fileMeta(join(outDir, name)) }));
  const receiptPath = join(outDir, "receipt.json");
  const receipt = readJsonIfPresent(receiptPath);
  const reportJson = outputs.find((o) => o.name.endsWith(".json") && o.present)
    ? readJsonIfPresent(join(outDir, outputs.find((o) => o.name.endsWith(".json")).name))
    : null;
  return {
    role,
    jobId,
    outDir,
    inputs,
    wrapperOk: result.ok === true,
    sold: result.sold === false ? false : result.sold,
    sample: result.sample === true,
    fundingState: result.fundingState || null,
    analysisStatus: result.classified?.analysis?.status || null,
    analysisOutcome: result.classified?.analysis?.outcome || null,
    transport: result.classified?.transport || null,
    delivery: result.classified?.delivery || null,
    usefulDelivery: result.classified?.usefulDelivery === true,
    validNoChange: result.classified?.validNoChange === true,
    validRefusal: result.classified?.validRefusal === true,
    engineDigest: result.classified?.engineDigest || null,
    inputsDigest: result.receipt?.inputsDigest || null,
    outputsDigest: result.receipt?.outputsDigest || null,
    receiptSchema: receipt?.schema || result.receipt?.schema || null,
    receipt: fileMeta(receiptPath),
    outputs,
    domainStatus: reportJson?.status || null,
    domainSummary: reportJson?.summary || null,
    classified: result.classified,
  };
}

export function testedPins() {
  return {
    sds52: { ...SDS52, cli: WRAPPER_CLI, onThisBranch: false, historical: true },
    d01: { ...D01_OBSERVED, cli: WRAPPER_CLI, onThisBranch: true },
    co03: { ...CO03 },
    co17: { ...CO17 },
  };
}

export function packJourney({
  packetDir,
  jobId = DEFAULT_JOB_ID,
  inputs,
  funding = "reserved-fixture",
  payment = null,
  evidencePath = null,
  label = "owner-qa",
} = {}) {
  const root = resolve(packetDir);
  const firstDir = join(root, "first");
  mkdirSync(firstDir, { recursive: true });

  const listed = listJobs();
  const result = runWrapperJob({
    jobId,
    inputs,
    funding,
    payment,
    outDir: firstDir,
  });

  const first = snapshotJob({ jobId, outDir: firstDir, result, role: "first", inputs });
  const archive = fileMeta(ARCHIVE_PATH);
  const catalog = fileMeta(CATALOG_PATH);
  const field = readFieldEvidence(evidencePath);

  const packet = {
    schema: KIT_SCHEMA,
    label,
    packedAt: new Date().toISOString(),
    tested: testedPins(),
    engineArchive: {
      path: ARCHIVE_PATH,
      sha256: archive.sha256,
      bytes: archive.bytes,
      expectedSha256: ARCHIVE_SHA256,
      expectedBytes: ARCHIVE_BYTES,
      match: archive.sha256 === ARCHIVE_SHA256 && archive.bytes === ARCHIVE_BYTES,
    },
    catalog: {
      path: CATALOG_PATH,
      sha256: catalog.sha256,
      jobsListed: listed.ok ? listed.jobs : [],
      listOk: listed.ok === true,
    },
    firstJob: first,
    returnJob: null,
    settlement: {
      sold: false,
      purchaseAuthority: false,
      liveSettlement: "out-of-scope",
      fundingState: result.fundingState || null,
      fixture: funding === "reserved-fixture",
    },
    deploy: {
      deployed: false,
      publicOrigin: null,
      artifact: "absent",
    },
    field,
    wrapperListLiveSettlement: listed.liveSettlement || null,
    code: result.ok ? null : result.code || "pack-failed",
    ok: result.classified?.usefulDelivery === true && archive.sha256 === ARCHIVE_SHA256,
  };

  writeFileSync(join(root, "packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
  return { packetDir: root, packet, result };
}

export function loadPacket(packetDir) {
  const file = join(resolve(packetDir), "packet.json");
  if (!existsSync(file)) {
    return { ok: false, code: "packet-missing", error: `missing ${file}` };
  }
  const packet = JSON.parse(readFileSync(file, "utf8"));
  return { ok: true, packet, packetDir: resolve(packetDir), file };
}

export function readbackPacket(packetDir, { evidencePath = null } = {}) {
  const loaded = loadPacket(packetDir);
  if (!loaded.ok) return loaded;
  const { packet } = loaded;
  const failures = [];

  if (packet.schema !== KIT_SCHEMA) failures.push("schema-mismatch");

  const archiveNow = fileMeta(ARCHIVE_PATH);
  if (archiveNow.sha256 !== ARCHIVE_SHA256 || archiveNow.bytes !== ARCHIVE_BYTES) {
    failures.push("archive-identity-mismatch");
  }
  if (packet.engineArchive?.sha256 && packet.engineArchive.sha256 !== archiveNow.sha256) {
    failures.push("archive-moved-since-pack");
  }

  const listed = listJobs();
  if (!listed.ok) failures.push("wrapper-list-failed");
  if (listed.ok && packet.firstJob?.jobId && !listed.jobs.includes(packet.firstJob.jobId)) {
    failures.push("job-missing-from-catalog-list");
  }

  if (packet.firstJob?.receiptSchema && packet.firstJob.receiptSchema !== RECEIPT_SCHEMA) {
    failures.push("receipt-schema-mismatch");
  }

  for (const output of packet.firstJob?.outputs || []) {
    const current = fileMeta(join(packet.firstJob.outDir, output.name));
    if (!current.present) failures.push(`missing-output:${output.name}`);
    else if (output.sha256 && current.sha256 !== output.sha256) failures.push(`output-bytes-changed:${output.name}`);
  }
  if (packet.firstJob?.receipt?.sha256) {
    const rec = fileMeta(join(packet.firstJob.outDir, "receipt.json"));
    if (!rec.present) failures.push("missing-receipt");
    else if (rec.sha256 !== packet.firstJob.receipt.sha256) failures.push("receipt-bytes-changed");
  }

  if (packet.settlement?.sold === true) failures.push("sold-true-not-a-release");
  if (packet.firstJob?.sample === true && packet.firstJob?.usefulDelivery) {
    failures.push("sample-cannot-be-useful-release");
  }

  const d01OnPacket = packet.firstJob?.classified?.contract === D01_OBSERVED.contract;
  const sds52LacksContract = packet.firstJob?.classified?.contract == null;

  const field = evidencePath ? readFieldEvidence(evidencePath) : packet.field || readFieldEvidence(null);

  return {
    ok: failures.length === 0,
    code: failures.length ? failures[0] : null,
    failures,
    packet,
    archiveNow,
    listedJobs: listed.jobs,
    field,
    sds52LacksD01Contract: sds52LacksContract,
    d01ContractObservedOnResult: d01OnPacket,
  };
}

export function savePacket(packetDir, packet) {
  const root = resolve(packetDir);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
  return join(root, "packet.json");
}

export function packetPath(packetDir) {
  return join(resolve(packetDir), "packet.json");
}
