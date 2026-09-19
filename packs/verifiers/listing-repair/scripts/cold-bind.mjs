#!/usr/bin/env node
/**
 * Cold bind: extract the real useful-jobs 1.4.7 archive, run listing-repair-packet
 * for --example and samples/listing/mismatch.json, then judge the engine's
 * repair-packet.json with this oracle.
 *
 * The runner exits 0 only when the oracle rejects as specified (fabricated
 * sample, mismatch not accepted_correction, mutated snapshot digest stale).
 * It never republishes the kit.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeBindRecord, wrapListingAsSource } from "../src/bind.mjs";
import { PINS } from "../src/constants.mjs";
import { snapshotDigest } from "../src/digest.mjs";
import { findKitArchive, hashFile, pinKitArchive, repoRootFromPack } from "../src/kit.mjs";
import { verifyListingRepair } from "../src/verify.mjs";

const SPAWN = { encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 };

const packRoot = dirname(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = repoRootFromPack(packRoot);

function runJson(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { ...SPAWN, cwd });
  let json = null;
  const text = String(r.stdout || "").trim();
  if (text) {
    try {
      json = JSON.parse(text.split("\n").filter(Boolean).at(-1));
    } catch {
      json = null;
    }
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function mutateListing(listing) {
  const copy = JSON.parse(JSON.stringify(listing));
  const routes = copy.record?.routeRegressionInput?.current?.routes;
  if (Array.isArray(routes) && routes[0]) {
    routes[0].title = `${routes[0].title || "route"} [MUTATED-DIGEST]`;
  }
  if (copy.discovery?.listing) {
    copy.discovery.listing.title = "MUTATED-SNAPSHOT";
  }
  copy.clock = "2099-01-01T00:00:00.000Z";
  return copy;
}

export function runColdBind({ keepTmp = false } = {}) {
  const archive = findKitArchive(repoRoot);
  if (!archive) {
    return { ok: false, error: "kit archive not found", repoRoot };
  }
  const pin = pinKitArchive(archive, { repoRoot });
  const work = mkdtempSync(join(tmpdir(), "listing-repair-bind-147-"));
  const report = {
    schema: "sds.listing_repair.bind_cold.v1",
    pack: "R14-07-SDS-LISTING-REPAIR-BIND",
    purchaseAuthority: false,
    republishKit: false,
    kit: pin,
    overlay: null,
    example: null,
    mismatch: null,
    mutated: null,
    publish: null,
    positive: null,
    cross: null,
    partial: null,
    work,
  };

  try {
    const tar = spawnSync("tar", ["-xzf", archive, "-C", work], { ...SPAWN });
    if (tar.status !== 0) {
      report.ok = false;
      report.error = `tar extract failed: ${tar.stderr}`;
      return report;
    }
    const kit = join(work, "useful-jobs-1.4.7");
    const cliHash = hashFile(join(kit, "apps/listing-repair-packet/cli.mjs"));
    const boundaryHash = hashFile(join(kit, "apps/listing-repair-packet/listing-repair-boundary.mjs"));
    report.overlay = {
      cliSha256: cliHash.sha256,
      cliPinOk: cliHash.sha256 === PINS.cliSha256,
      boundarySha256: boundaryHash.sha256,
      boundaryPinOk: boundaryHash.sha256 === PINS.boundarySha256,
    };

    const exampleOut = join(work, "out-example");
    mkdirSync(exampleOut, { recursive: true });
    const exampleRun = runJson(
      process.execPath,
      [join(kit, "bin/useful-jobs.mjs"), "run", "listing-repair-packet", "--example", "--out-dir", exampleOut],
      kit,
    );
    const examplePacket = JSON.parse(readFileSync(join(exampleOut, "repair-packet.json"), "utf8"));
    const exampleListing = JSON.parse(readFileSync(join(kit, "samples/listing/caller-alpha.json"), "utf8"));
    const exampleSource = wrapListingAsSource(exampleListing, {
      file: "samples/listing/caller-alpha.json",
    });
    const exampleVerdict = verifyListingRepair({ packet: examplePacket, source: exampleSource });
    report.example = {
      engineExit: exampleRun.status,
      engine: exampleRun.json,
      packetStatus: examplePacket.status,
      packetDigest: examplePacket.digest,
      exampleMode: examplePacket.caller?.exampleMode === true,
      hasCorrections: Array.isArray(examplePacket.corrections),
      hasSourceObservation: Boolean(examplePacket.sourceObservation),
      actionKinds: (examplePacket.actions || []).map((a) => a.kind),
      verifyExit: exampleVerdict.ok ? 0 : 1,
      reasons: exampleVerdict.reasons,
      accepted_correction: exampleVerdict.checks.accepted_correction,
      envelopeBound: exampleVerdict.checks.envelopeBound,
      sourceBound: exampleVerdict.checks.sourceBound,
      fabricated: exampleVerdict.checks.fabricated,
      purchaseAuthority: exampleVerdict.provenance.purchaseAuthority,
      publish: exampleVerdict.checks.publish,
    };

    const mismatchOut = join(work, "out-mismatch");
    mkdirSync(mismatchOut, { recursive: true });
    const mismatchInput = join(kit, "samples/listing/mismatch.json");
    const mismatchRun = runJson(
      process.execPath,
      [
        join(kit, "bin/useful-jobs.mjs"),
        "run",
        "listing-repair-packet",
        "--input",
        mismatchInput,
        "--out-dir",
        mismatchOut,
      ],
      kit,
    );
    const mismatchPacket = JSON.parse(readFileSync(join(mismatchOut, "repair-packet.json"), "utf8"));
    const mismatchListing = JSON.parse(readFileSync(mismatchInput, "utf8"));
    const mismatchSource = wrapListingAsSource(mismatchListing, {
      file: "samples/listing/mismatch.json",
    });
    const mismatchVerdict = verifyListingRepair({ packet: mismatchPacket, source: mismatchSource });
    report.mismatch = {
      engineExit: mismatchRun.status,
      engine: mismatchRun.json,
      packetStatus: mismatchPacket.status,
      packetDigest: mismatchPacket.digest,
      exampleMode: mismatchPacket.caller?.exampleMode === true,
      verifyExit: mismatchVerdict.ok ? 0 : 1,
      reasons: mismatchVerdict.reasons,
      accepted_correction: mismatchVerdict.checks.accepted_correction,
      envelopeBound: mismatchVerdict.checks.envelopeBound,
      sourceBound: mismatchVerdict.checks.sourceBound,
    };

    const mutatedListing = mutateListing(mismatchListing);
    const mutatedSource = wrapListingAsSource(mutatedListing, {
      file: "samples/listing/mismatch.json",
      boundDigest: snapshotDigest(mismatchListing),
    });
    const mutatedVerdict = verifyListingRepair({ packet: mismatchPacket, source: mutatedSource });
    report.mutated = {
      verifyExit: mutatedVerdict.ok ? 0 : 1,
      reasons: mutatedVerdict.reasons,
      accepted_correction: mutatedVerdict.checks.accepted_correction,
      stale: mutatedVerdict.checks.stale,
      sourceBound: mutatedVerdict.checks.sourceBound,
    };

    const publishVerdict = verifyListingRepair({
      packet: examplePacket,
      source: exampleSource,
      flags: { publish: true },
    });
    report.publish = {
      verifyExit: publishVerdict.ok ? 0 : 1,
      reasons: publishVerdict.reasons,
      accepted_correction: publishVerdict.checks.accepted_correction,
      publish: publishVerdict.checks.publish,
    };

    const positiveOut = join(work, "out-positive");
    mkdirSync(positiveOut, { recursive: true });
    const positiveInput = join(kit, "samples/listing/caller-alpha.json");
    const positiveRun = runJson(
      process.execPath,
      [
        join(kit, "bin/useful-jobs.mjs"),
        "run",
        "listing-repair-packet",
        "--input",
        positiveInput,
        "--out-dir",
        positiveOut,
      ],
      kit,
    );
    const positivePacket = JSON.parse(readFileSync(join(positiveOut, "repair-packet.json"), "utf8"));
    const positiveSource = wrapListingAsSource(exampleListing, {
      file: "samples/listing/caller-alpha.json",
    });
    const positiveBind = makeBindRecord({
      packet: positivePacket,
      source: positiveSource,
      kit: { version: PINS.usefulJobs, sha256: PINS.archiveSha256, bytes: PINS.archiveBytes },
    });
    const positiveVerdict = verifyListingRepair({
      packet: positivePacket,
      source: positiveSource,
      bind: positiveBind,
      flags: { sourcePath: positiveInput },
    });
    report.positive = {
      engineExit: positiveRun.status,
      packetStatus: positivePacket.status,
      exampleMode: positivePacket.caller?.exampleMode === true,
      verifyExit: positiveVerdict.ok ? 0 : 1,
      ok: positiveVerdict.ok,
      reasons: positiveVerdict.reasons,
      accepted_correction: positiveVerdict.checks.accepted_correction,
      sourceBound: positiveVerdict.checks.sourceBound,
      envelopeBound: positiveVerdict.checks.envelopeBound,
    };

    const crossVerdict = verifyListingRepair({
      packet: positivePacket,
      source: mismatchSource,
      flags: { sourcePath: mismatchInput },
    });
    report.cross = {
      verifyExit: crossVerdict.ok ? 0 : 1,
      reasons: crossVerdict.reasons,
      accepted_correction: crossVerdict.checks.accepted_correction,
      sourceBound: crossVerdict.checks.sourceBound,
    };

    const partialOut = join(work, "out-partial");
    mkdirSync(partialOut, { recursive: true });
    const partialInput = join(kit, "samples/listing/partial.json");
    const partialRun = runJson(
      process.execPath,
      [
        join(kit, "bin/useful-jobs.mjs"),
        "run",
        "listing-repair-packet",
        "--input",
        partialInput,
        "--out-dir",
        partialOut,
      ],
      kit,
    );
    const partialPacket = JSON.parse(readFileSync(join(partialOut, "repair-packet.json"), "utf8"));
    const partialListing = JSON.parse(readFileSync(partialInput, "utf8"));
    const partialSource = wrapListingAsSource(partialListing, {
      file: "samples/listing/partial.json",
    });
    const partialVerdict = verifyListingRepair({
      packet: partialPacket,
      source: partialSource,
      flags: { sourcePath: partialInput },
    });
    report.partial = {
      engineExit: partialRun.status,
      packetStatus: partialPacket.status,
      verifyExit: partialVerdict.ok ? 0 : 1,
      reasons: partialVerdict.reasons,
      accepted_correction: partialVerdict.checks.accepted_correction,
    };

    const checks = {
      kitPin: pin.ok === true,
      overlayCli: report.overlay.cliPinOk === true,
      overlayBoundary: report.overlay.boundaryPinOk === true,
      exampleEngineOk: exampleRun.status === 0 && exampleRun.json?.ok === true,
      exampleFabricated:
        report.example.verifyExit === 1 &&
        report.example.reasons.includes("fabricated_sample") &&
        report.example.accepted_correction === false,
      exampleEnvelope: report.example.envelopeBound === true && report.example.hasCorrections === false,
      mismatchEngineOk: mismatchRun.status === 0 && mismatchRun.json?.ok === true,
      mismatchNotCorrection:
        report.mismatch.accepted_correction === false &&
        report.mismatch.reasons.includes("mismatch_not_correction") &&
        report.mismatch.packetStatus === "refused",
      mutatedStale:
        report.mutated.verifyExit === 1 && report.mutated.reasons.includes("stale_source_digest"),
      publishRefused:
        report.publish.verifyExit === 1 && report.publish.reasons.includes("publish_attempted"),
      positiveBound:
        report.positive.verifyExit === 0 &&
        report.positive.ok === true &&
        report.positive.accepted_correction === true &&
        report.positive.exampleMode === false &&
        report.positive.packetStatus === "actionable",
      crossListingRefused:
        report.cross.accepted_correction === false &&
        report.cross.reasons.includes("source_locator_mismatch"),
      partialNotFinal:
        report.partial.packetStatus === "partial" &&
        report.partial.accepted_correction === false &&
        report.partial.reasons.includes("partial_not_final"),
      kitUnchanged: pin.sha256 === PINS.archiveSha256 && pin.bytes === PINS.archiveBytes,
    };
    report.checks = checks;
    report.ok = Object.values(checks).every(Boolean);
    return report;
  } finally {
    if (!keepTmp) rmSync(work, { recursive: true, force: true });
  }
}

function writeOptionalCapture(report) {
  const out = process.env.LISTING_REPAIR_BIND_CAPTURE_DIR;
  if (!out || !report?.work) return;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "cold-bind-report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keep = process.argv.includes("--keep") || Boolean(process.env.LISTING_REPAIR_BIND_CAPTURE_DIR);
  const report = runColdBind({ keepTmp: keep });
  writeOptionalCapture(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}
