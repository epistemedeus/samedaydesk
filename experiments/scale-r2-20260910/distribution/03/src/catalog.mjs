import {
  AVAILABILITY_STATUS,
  CATALOG_SCHEMA,
  ERROR_CODES,
  INVENTORY_SCHEMA,
} from "./constants.mjs";
import { catalogError, validateInventory } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

export const CATALOG_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

/**
 * Build one source-linked portable package catalog from inventory.
 * Quotes documented install commands; preserves observed vs recommended-not-run.
 * Never invents public listing or user counts. No provider login/rebuild.
 */
export function buildPortableCatalog(inventory, options = {}) {
  const clock = options.clock || defaultClock;
  let inv;
  try {
    inv = validateInventory(inventory);
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: CATALOG_SCHEMA,
        status: CATALOG_STATUS.PARTIAL,
        generatedAt: new Date(clock()).toISOString(),
        inventorySchema: inventory?.schema ?? null,
        cite: typeof inventory?.cite === "string" ? inventory.cite : null,
        packages: [],
        missingInputs: err.details?.missing || [err.message],
        mutationBoundary: mutationBoundary(),
        consumerInstructions: consumerInstructions(),
        error: { code: err.code, message: err.message, details: err.details || null },
      };
    }
    throw err;
  }

  const missing = [];
  const packages = [];

  for (let i = 0; i < inv.packages.length; i++) {
    const entry = inv.packages[i];
    const path = `packages[${i}]`;

    if (!entry.installCommands || entry.installCommands.length === 0) {
      missing.push(`${path}.installCommands`);
    }

    if (!entry.availability || !entry.availability.status) {
      missing.push(`${path}.availability.status`);
      continue;
    }

    const av = normalizeAvailability(entry.availability);

    // Entry-level unavailable short-circuit still includes the package with truthful status
    packages.push({
      id: entry.id,
      sourceRepo: entry.sourceRepo,
      sourcePin: entry.sourcePin,
      sourcePath: entry.sourcePath,
      kind: entry.kind,
      installCommands: (entry.installCommands || []).map((c) => ({
        command: c.command,
        observed: c.observed === true,
        note:
          c.note ||
          (c.observed === true
            ? "observed: ran successfully per cited evidence on this VM lineage"
            : "recommended-not-run: documented in package README; not re-executed by this catalog kit"),
        evidenceRef: c.evidenceRef || null,
      })),
      availability: av,
      stagingKitRefs: entry.stagingKitRefs || null,
      notes: entry.notes || null,
    });
  }

  // Top-level status: if any package unavailable and none ready → unavailable;
  // if any no_users-only mix with ready → still ready with packages; partial if missing cmds
  const statuses = packages.map((p) => p.availability.status);
  let status = CATALOG_STATUS.READY;
  if (missing.length) {
    status = CATALOG_STATUS.PARTIAL;
  } else if (
    statuses.length > 0 &&
    statuses.every((s) => s === AVAILABILITY_STATUS.UNAVAILABLE)
  ) {
    status = CATALOG_STATUS.UNAVAILABLE;
  } else if (
    statuses.length > 0 &&
    statuses.every((s) => s === AVAILABILITY_STATUS.NO_USERS)
  ) {
    status = CATALOG_STATUS.NO_USERS;
  }

  return {
    schema: CATALOG_SCHEMA,
    status,
    generatedAt: new Date(clock()).toISOString(),
    inventorySchema: INVENTORY_SCHEMA,
    cite: inv.cite,
    packages,
    missingInputs: missing,
    truthNotes: [
      "Grexal availability is active_public per S149 PUBLIC_ACTIVE receipt (exact agentId/deployment/pricing).",
      "Agensi remains pending_review / Free with installs=0; no invented demand.",
      "No customer execution/revenue/payout connection yet (customerExecutionRevenuePayout=false).",
      "Do not invent public availability or user counts beyond cited receipts.",
      "unavailable ≠ no_users: unavailable omits users; no_users means capture succeeded with zero users.",
      "Install commands are quoted from package READMEs; observed=true only when evidence shows a successful run.",
    ],
    mutationBoundary: mutationBoundary(),
    consumerInstructions: consumerInstructions(),
    evidenceIndex: "evidence/INDEX.md",
  };
}

function normalizeAvailability(av) {
  if (av.status === AVAILABILITY_STATUS.UNAVAILABLE) {
    return {
      status: AVAILABILITY_STATUS.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "provider_or_capture_unavailable",
      reason: av.reason || "provider or capture read unavailable",
      observedAt: av.observedAt || null,
      evidenceRefs: av.evidenceRefs || [],
      // Explicitly omit users — unavailable ≠ no_users
    };
  }
  if (av.status === AVAILABILITY_STATUS.NO_USERS) {
    return {
      status: AVAILABILITY_STATUS.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_users",
      users: 0,
      installs: av.installs === undefined ? 0 : av.installs,
      runs: av.runs === undefined ? 0 : av.runs,
      reason: av.reason || "capture succeeded; zero users/installs/runs",
      observedAt: av.observedAt || null,
      evidenceRefs: av.evidenceRefs || [],
    };
  }
  if (av.status === AVAILABILITY_STATUS.ACTIVE_PUBLIC) {
    return {
      status: AVAILABILITY_STATUS.ACTIVE_PUBLIC,
      label: availabilityLabel(av.status),
      reason: av.reason || null,
      observedAt: av.observedAt || null,
      evidenceRefs: av.evidenceRefs || [],
      agentId: av.agentId,
      deploymentId: av.deploymentId,
      deploymentVersion: av.deploymentVersion,
      pricing: av.pricing
        ? {
            version: av.pricing.version,
            run_completed_usd: av.pricing.run_completed_usd,
            estimate_reserve_usd: av.pricing.estimate_reserve_usd,
            estimateReserveIsCharge: av.pricing.estimateReserveIsCharge === true,
          }
        : null,
      category: av.category || null,
      tags: Array.isArray(av.tags) ? [...av.tags] : [],
      homepage: av.homepage || null,
      // Authoritative: no customer execution/revenue/payout connection yet
      customerExecutionRevenuePayout: av.customerExecutionRevenuePayout === true,
    };
  }
  const out = {
    status: av.status,
    label: availabilityLabel(av.status),
    reason: av.reason || null,
    observedAt: av.observedAt || null,
    evidenceRefs: av.evidenceRefs || [],
  };
  if (av.installs !== undefined) out.installs = av.installs;
  if (av.tier !== undefined) out.tier = av.tier;
  return out;
}

function availabilityLabel(status) {
  switch (status) {
    case AVAILABILITY_STATUS.AVAILABLE_LOCAL:
      return "local_package_tree_present";
    case AVAILABILITY_STATUS.DRAFT_PRIVATE:
      return "provider_draft_private_no_public_listing_observed";
    case AVAILABILITY_STATUS.ACTIVE_PUBLIC:
      return "provider_public_active_priced_deployment";
    case AVAILABILITY_STATUS.PENDING_REVIEW:
      return "provider_pending_review_root_owns_next";
    default:
      return status;
  }
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    rebuildsPackages: false,
    forbids: [
      "grexal login",
      "grexal push --publish",
      "grexal publish",
      "grexal agent price",
      "agensi Bot login",
      "agensi review re-submit",
      "rebuild grexal/agensi package source",
      "invent public listing or user counts",
      "merge to default",
    ],
    ownerOfPublicationAndPrice: "Root",
    pointsAtExistingPins: true,
  };
}

function consumerInstructions() {
  return [
    "node experiments/scale-r2-20260910/distribution/03/src/cli.mjs demo",
    "node experiments/scale-r2-20260910/distribution/03/src/cli.mjs build experiments/scale-r2-20260910/distribution/03/fixtures/inventory.positive.json",
    "node experiments/scale-r2-20260910/distribution/03/src/cli.mjs validate /tmp/r2-dist-03-catalog.json",
    "npm run test:r2-distribution-03",
    "Catalog only — does not login, publish, price, or rebuild Grexal/Agensi packages.",
  ].join("\n");
}

/** Guard used by tests: unavailable and no_users must remain distinct. */
export function assertAvailabilityDistinct(unavailableCatalog, noUsersCatalog) {
  const uPkg = unavailableCatalog.packages?.[0]?.availability;
  const nPkg = noUsersCatalog.packages?.[0]?.availability;
  if (!uPkg || uPkg.status !== AVAILABILITY_STATUS.UNAVAILABLE) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "expected unavailable package availability");
  }
  if (Object.prototype.hasOwnProperty.call(uPkg, "users")) {
    throw catalogError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report users (would collapse into no_users)",
    );
  }
  if (!nPkg || nPkg.status !== AVAILABILITY_STATUS.NO_USERS) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "expected no_users package availability");
  }
  if (uPkg.status === nPkg.status) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "availability statuses collapsed");
  }
  if (unavailableCatalog.status === noUsersCatalog.status && unavailableCatalog.status !== CATALOG_STATUS.PARTIAL) {
    // top-level may differ; require package-level distinct at minimum already checked
  }
  if (uPkg.code === nPkg.code) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "availability codes collapsed");
  }
  return true;
}
