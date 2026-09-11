/**
 * Seeded-failure refusals. This join is read-only and non-settling.
 */

export const REFUSAL = Object.freeze({
  RECIPE_IS_NOT_CATALOG_JOB: "recipe_is_not_catalog_job",
  PAYMENT_REQUIRED_IS_NOT_PAID: "routing_paymentRequired_is_not_paid",
  JOIN_IS_READ_ONLY: "join_is_read_only",
  EXECUTION_NOT_AUTHORIZED: "executionAuthorized_stays_false",
  OUT_PATH_FORBIDDEN: "out_path_hits_published_surface",
  INCONSISTENT_NAMED_SOURCE: "inconsistent_named_source",
  MISSING_NAMED_SOURCE: "missing_named_source",
});

export class JoinRefusal extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "JoinRefusal";
    this.code = code;
    this.ok = false;
    this.executionAuthorized = false;
    this.paid = false;
    Object.assign(this, extra);
  }

  toJSON() {
    const body = {
      ok: false,
      outcome: "refused",
      code: this.code,
      message: this.message,
      executionAuthorized: false,
      paid: false,
    };
    if (this.surface) body.surface = this.surface;
    return body;
  }
}

export function refuseRecipeAsCatalogJob({ recipeId, claimedCatalogJobId, catalogJobIds }) {
  const catalog = new Set(catalogJobIds || []);
  const claimed = claimedCatalogJobId || recipeId;
  throw new JoinRefusal(
    REFUSAL.RECIPE_IS_NOT_CATALOG_JOB,
    `recipe ${recipeId} is not a useful-jobs catalog job id (claimed ${claimed})`,
    {
      recipeId,
      claimedCatalogJobId: claimed,
      inCatalog: catalog.has(claimed),
    },
  );
}

export function refusePaymentRequiredAsPaid(route) {
  throw new JoinRefusal(
    REFUSAL.PAYMENT_REQUIRED_IS_NOT_PAID,
    "offer-routing paymentRequired means a remote request would cost money; paid stays false and is not settlement",
    {
      offerId: route?.selected?.offerId || route?.offerId || null,
      paymentRequired: route?.paymentRequired === true,
      paid: false,
    },
  );
}

export function refuseEditPublishedSurface({ action, path } = {}) {
  throw new JoinRefusal(
    REFUSAL.JOIN_IS_READ_ONLY,
    "recipes-catalog-join does not edit recipes, catalog, families, or offer-routing",
    { action: action || "edit", path: path || null },
  );
}

export function assertExecutionUnauthorized(value) {
  if (value !== false) {
    throw new JoinRefusal(
      REFUSAL.EXECUTION_NOT_AUTHORIZED,
      "executionAuthorized stays false for this join",
    );
  }
}

export function assertPaidFalse(value) {
  if (value === true) {
    throw new JoinRefusal(
      REFUSAL.PAYMENT_REQUIRED_IS_NOT_PAID,
      "paid must stay false; this wave is a nonsettling prototype",
    );
  }
}

export function refuseInconsistentSource({ message, surface, detail } = {}) {
  throw new JoinRefusal(
    REFUSAL.INCONSISTENT_NAMED_SOURCE,
    message || "named input sources are internally inconsistent",
    { surface: surface || null, detail: detail || null },
  );
}

export function refuseMissingNamedSource({ name, path } = {}) {
  throw new JoinRefusal(
    REFUSAL.MISSING_NAMED_SOURCE,
    `named source ${name || "input"} is missing`,
    { surface: name || null, path: path || null },
  );
}
