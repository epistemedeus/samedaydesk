#!/usr/bin/env node
/** Capture real 1.4.7 repair-packet.json fixtures and source-observation wrappers. */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeBindRecord, wrapListingAsSource } from "../src/bind.mjs";
import { PINS } from "../src/constants.mjs";
import { snapshotDigest } from "../src/digest.mjs";
import { findKitArchive, pinKitArchive, repoRootFromPack } from "../src/kit.mjs";

const packRoot = dirname(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = repoRootFromPack(packRoot);

function write(rel, value) {
  const p = join(packRoot, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
  return rel;
}

function mutateListing(listing) {
  const copy = JSON.parse(JSON.stringify(listing));
  const routes = copy.record?.routeRegressionInput?.current?.routes;
  if (Array.isArray(routes) && routes[0]) {
    routes[0].title = `${routes[0].title || "route"} [MUTATED-DIGEST]`;
  }
  if (copy.discovery?.listing) copy.discovery.listing.title = "MUTATED-SNAPSHOT";
  copy.clock = "2099-01-01T00:00:00.000Z";
  return copy;
}

const archive = findKitArchive(repoRoot);
if (!archive) {
  console.error("kit archive not found");
  process.exit(2);
}
const pin = pinKitArchive(archive, { repoRoot });
if (!pin.ok) {
  console.error("kit pin mismatch", pin);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "listing-repair-stamp-"));
const files = [];
try {
  const tar = spawnSync("tar", ["-xzf", archive, "-C", work], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (tar.status !== 0) throw new Error(tar.stderr);
  const kit = join(work, "useful-jobs-1.4.7");

  function runJob(args, outDir) {
    mkdirSync(outDir, { recursive: true });
    const r = spawnSync(process.execPath, [join(kit, "bin/useful-jobs.mjs"), "run", "listing-repair-packet", ...args, "--out-dir", outDir], {
      encoding: "utf8",
      cwd: kit,
      timeout: 120_000,
    });
    if (r.status !== 0) throw new Error(`${args.join(" ")}: ${r.stderr}\n${r.stdout}`);
    return JSON.parse(readFileSync(join(outDir, "repair-packet.json"), "utf8"));
  }

  const examplePacket = runJob(["--example"], join(work, "out-example"));
  const exampleListing = JSON.parse(readFileSync(join(kit, "samples/listing/caller-alpha.json"), "utf8"));
  const exampleSource = wrapListingAsSource(exampleListing, { file: "samples/listing/caller-alpha.json" });
  files.push(write("fixtures/cold/example.packet.json", examplePacket));
  files.push(write("fixtures/cold/example.source.json", exampleSource));
  files.push(
    write(
      "fixtures/cold/example.bind.json",
      makeBindRecord({
        packet: examplePacket,
        source: exampleSource,
        kit: { version: PINS.usefulJobs, sha256: PINS.archiveSha256, bytes: PINS.archiveBytes },
      }),
    ),
  );

  const mismatchPacket = runJob(["--input", join(kit, "samples/listing/mismatch.json")], join(work, "out-mismatch"));
  const mismatchListing = JSON.parse(readFileSync(join(kit, "samples/listing/mismatch.json"), "utf8"));
  const mismatchSource = wrapListingAsSource(mismatchListing, { file: "samples/listing/mismatch.json" });
  files.push(write("fixtures/cold/mismatch.packet.json", mismatchPacket));
  files.push(write("fixtures/cold/mismatch.source.json", mismatchSource));
  files.push(
    write(
      "fixtures/cold/mismatch.bind.json",
      makeBindRecord({
        packet: mismatchPacket,
        source: mismatchSource,
        kit: { version: PINS.usefulJobs, sha256: PINS.archiveSha256, bytes: PINS.archiveBytes },
      }),
    ),
  );

  const inputAlphaPacket = runJob(["--input", join(kit, "samples/listing/caller-alpha.json")], join(work, "out-input-alpha"));
  files.push(write("fixtures/cold/input-alpha.packet.json", inputAlphaPacket));
  files.push(
    write(
      "fixtures/cold/input-alpha.bind.json",
      makeBindRecord({
        packet: inputAlphaPacket,
        source: exampleSource,
        kit: { version: PINS.usefulJobs, sha256: PINS.archiveSha256, bytes: PINS.archiveBytes },
      }),
    ),
  );

  const partialPacket = runJob(["--input", join(kit, "samples/listing/partial.json")], join(work, "out-partial"));
  const partialListing = JSON.parse(readFileSync(join(kit, "samples/listing/partial.json"), "utf8"));
  const partialSource = wrapListingAsSource(partialListing, { file: "samples/listing/partial.json" });
  files.push(write("fixtures/cold/partial.packet.json", partialPacket));
  files.push(write("fixtures/cold/partial.source.json", partialSource));

  const mutated = mutateListing(mismatchListing);
  files.push(
    write(
      "fixtures/cold/mutated.source.json",
      wrapListingAsSource(mutated, {
        file: "samples/listing/mismatch.json",
        boundDigest: snapshotDigest(mismatchListing),
      }),
    ),
  );

  const claimed = {
    ...mismatchPacket,
    claimedLane: "accepted_correction",
  };
  files.push(write("fixtures/reject/mismatch-claimed-accepted-correction.packet.json", claimed));

  const legacy = {
    schema: "s233.useful-application.artifact.v1",
    appId: "listing-repair-packet",
    status: "actionable",
    summary: "legacy 1.0.0 corrections[] shape — not a 1.4.7 engine packet",
    actions: [],
    corrections: [{ field: "listingStatus", from: "PendingReview", to: "PUBLIC_ACTIVE" }],
    gaps: [],
    notMarketFact: true,
    notCustomerDemand: true,
    noPurchaseAuthority: true,
    caller: { exampleMode: false, sampleLabel: "caller-input" },
    sourceLinked: true,
    digest: "deadbeefdeadbeef",
  };
  files.push(write("fixtures/reject/legacy-corrections.packet.json", legacy));

  const publish = {
    ...examplePacket,
    publish: true,
    publishTo: "https://samedaydesk.com/for-agents/useful-jobs/catalog.json",
    claimedLane: "publish",
  };
  files.push(write("fixtures/reject/publish-attempt.packet.json", publish));

  files.push(
    write("fixtures/pins.json", {
      schema: "sds.listing_repair.bind.pins.v1",
      ...PINS,
      archivePin: pin,
    }),
  );

  writeFileSync(
    join(packRoot, "fixtures/MANIFEST.json"),
    `${JSON.stringify(
      {
        schema: "sds.listing_repair_bind.fixtures.v1",
        stampedAt: new Date().toISOString(),
        files,
        note: "Cold packets are unmodified 1.4.7 engine output. Sources wrap the kit listing inputs. Kit is not republished.",
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ stamped: files.length, files, kit: pin }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
