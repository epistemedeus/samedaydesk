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
import { wrapListingAsSource } from "../src/bind.mjs";
import { PINS } from "../src/constants.mjs";
import { snapshotDigest } from "../src/digest.mjs";
import { findKitArchive, hashFile, pinKitArchive, repoRootFromPack } from "../src/kit.mjs";
import { verifyListingRepair } from "../src/verify.mjs";

const packRoot = dirname(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = repoRootFromPack(packRoot);

function runJson(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd });
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
  const pin = pinKitArchive(archive);
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
    work,
  };

  try {
    const tar = spawnSync("tar", ["-xzf", archive, "-C", work], { encoding: "utf8" });
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
