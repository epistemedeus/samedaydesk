/**
 * Merged useful-jobs.catalog.v1 for this tree's delivery kit.
 * Published catalog jobs stay in place. Selected M01 engines overlay by id
 * (no duplicates if the public catalog already lists them) so preflight /
 * order / completeness can look them up without a second kernel.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  firstOffer,
  loadCatalog as loadM01Catalog,
  selectedEngines,
} from "../../../experiments/wave5/m01/lib/catalog.mjs";
import { toD01Job } from "../../../experiments/wave5/m01/lib/d01-adapter.mjs";
import { CATALOG_SCHEMA } from "../../../tools/job-input-preflight/lib/constants.mjs";
import { DEFAULT_CATALOG } from "../../../tools/job-input-preflight/lib/roots.mjs";

export const FIRST_OFFER = "lockfile-pin-delta";

export function engineIdentityPin(engine) {
  const body = Buffer.from(
    JSON.stringify({
      schema: "samedaydesk.m01.engine-identity.v1",
      id: engine.id,
      repo: engine.pin.repo,
      sha: engine.pin.sha,
      ownedPath: engine.pin.ownedPath,
    }),
    "utf8",
  );
  return {
    sha256: createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
    version: String(engine.pin.sha),
    package: engine.pin.packageName || engine.id,
  };
}

export function isM01JobId(jobId, catalog = loadM01Catalog()) {
  return (catalog.engines || []).some((engine) => engine.id === jobId);
}

export function toDeliveryJob(engine) {
  const d01 = toD01Job(engine);
  return {
    id: engine.id,
    title: engine.id,
    summary: engine.notes?.[0] || engine.id,
    requiredInputs: [...d01.requiredInputs],
    optionalInputs: [],
    outputs: [...d01.outputs],
    m01: true,
    pin: engine.pin,
    enginePin: engineIdentityPin(engine),
    notes: d01.notes,
  };
}

export function loadDeliveryCatalog() {
  const published = JSON.parse(readFileSync(DEFAULT_CATALOG, "utf8"));
  const m01 = loadM01Catalog();
  const first = firstOffer(m01);
  const rest = selectedEngines(m01).filter((engine) => engine.id !== first.id);
  const overlay = [first, ...rest].map(toDeliveryJob);
  const overlayIds = new Set(overlay.map((job) => job.id));
  const byId = new Map();
  for (const job of published.jobs || []) byId.set(job.id, { ...job });
  for (const job of overlay) {
    const existing = byId.get(job.id);
    byId.set(job.id, existing ? { ...existing, ...job, m01: true } : job);
  }
  const remaining = (published.jobs || []).filter((job) => !overlayIds.has(job.id));
  const jobs = [...overlay.map((job) => byId.get(job.id)), ...remaining.map((job) => byId.get(job.id))];
  return {
    ...published,
    schema: CATALOG_SCHEMA,
    jobs,
    firstOffer: m01.firstOffer || FIRST_OFFER,
  };
}

export function pinForDeliveryJob(job, pins) {
  if (job?.enginePin?.sha256 && job.enginePin.bytes != null) {
    return {
      sha256: job.enginePin.sha256,
      bytes: job.enginePin.bytes,
      version: job.enginePin.version,
      package: job.enginePin.package,
    };
  }
  return {
    sha256: pins.archiveSha256,
    bytes: pins.archiveBytes,
    version: pins.version,
    package: pins.package,
  };
}

export function m01ReceiptProvenance(job) {
  const catalog = loadM01Catalog();
  const engine = (catalog.engines || []).find((row) => row.id === job.id);
  if (!engine) return null;
  const pin = engineIdentityPin(engine);
  return {
    package: pin.package,
    version: pin.version,
    purchaseAuthority: false,
    cli: `node ${engine.cli.relativeBin}`,
    archiveSha256: pin.sha256,
    archiveBytes: pin.bytes,
    sourceRepo: engine.pin.repo,
    sourceCommit: engine.pin.sha,
    ownedPath: engine.pin.ownedPath,
    source: "in-tree",
  };
}

export function listedOfferIds() {
  const m01 = loadM01Catalog();
  const first = firstOffer(m01).id;
  return [first, ...selectedEngines(m01).map((engine) => engine.id).filter((id) => id !== first)];
}
