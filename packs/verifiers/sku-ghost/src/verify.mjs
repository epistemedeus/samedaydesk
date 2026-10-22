import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  AUTHORITATIVE_REL,
  CLIENT_CATALOG_REL,
  CUSTOM_QUOTE_SLUG,
  FAILURES,
  HONESTY_NOTES,
  LLMS_REL,
  PACKAGE_ID,
  VERDICT_SCHEMA,
  VERIFIER,
} from "./constants.mjs";
import { fail } from "./failures.mjs";
import {
  isPlainObject,
  isSkuChangeAttempt,
  loadAuthoritativeOffers,
  parseClientCatalog,
  parseFixtureDocument,
  parseLlmsPricedLines,
  parsePaymentLinkSlugs,
} from "./parse.mjs";
import { committedPaths, findRepoRoot } from "./paths.mjs";

function sha256Text(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function advertisedSlug(row) {
  return typeof row?.slug === "string" && row.slug.trim() ? row.slug.trim() : "";
}

function resolveSlug(row, authoritative) {
  const slug = advertisedSlug(row);
  // Present slug is identity; name fallback is only for unlabeled dollar lines.
  if (slug) return slug;
  if (row.name && authoritative.byLabel[row.name]) return authoritative.byLabel[row.name].slug;
  return null;
}

function lookupAuth(authoritative, slug) {
  if (!slug || typeof slug !== "string") return null;
  if (typeof authoritative.getOffer === "function") {
    const rec = authoritative.getOffer(slug);
    if (!rec) return null;
    return {
      slug,
      amountCents: Number(rec.amount),
      label: typeof rec.label === "string" ? rec.label : slug,
    };
  }
  return Object.prototype.hasOwnProperty.call(authoritative.bySlug, slug)
    ? authoritative.bySlug[slug]
    : null;
}

function collectGhosts(advertised, authoritative) {
  const ghosts = [];
  for (const row of advertised) {
    const slug = resolveSlug(row, authoritative);
    const auth = lookupAuth(authoritative, slug);
    if (!slug || !auth) {
      ghosts.push({
        class: "ghost_sku",
        slug: slug || row.slug || "",
        name: row.name,
        amountCents: row.amountCents,
        surface: row.surface,
      });
      continue;
    }
    if (row.amountCents != null && row.amountCents !== auth.amountCents) {
      ghosts.push({
        class: "sku_price_mismatch",
        slug,
        name: row.name || auth.label,
        amountCents: row.amountCents,
        authoritativeCents: auth.amountCents,
        surface: row.surface,
      });
    }
  }
  return ghosts;
}

function mergeAdvertised(rows) {
  const bySlug = new Map();
  for (const row of rows) {
    const slug = row.slug || `unnamed:${row.name || row.surface}`;
    const prev = bySlug.get(slug) || {
      slug: row.slug || null,
      name: row.name,
      amountCents: row.amountCents,
      surfaces: [],
    };
    if (!prev.surfaces.includes(row.surface)) prev.surfaces.push(row.surface);
    if (prev.amountCents == null) prev.amountCents = row.amountCents;
    if (!prev.name && row.name) prev.name = row.name;
    bySlug.set(slug, prev);
  }
  return [...bySlug.values()];
}

function honestyEnvelope(extra) {
  return {
    ok: extra.ok,
    schema: extra.schema,
    verifier: extra.verifier,
    packageId: extra.packageId,
    mode: extra.mode,
    paid: false,
    purchaseAuthority: false,
    skuChange: false,
    liveSdsPricesUnchanged: true,
    checkoutTouched: false,
    publishAttempted: false,
    neoTouched: false,
    advertised: extra.advertised,
    ghosts: extra.ghosts,
    unadvertised: extra.unadvertised || [],
    recorded: extra.recorded,
    surfaces: extra.surfaces || null,
    checks: extra.checks,
    honesty: HONESTY_NOTES,
  };
}

export async function verifySkuGhost({
  mode = "committed",
  fixturePath = null,
  fixtureRaw = null,
  repoRoot = findRepoRoot(),
  flags = {},
} = {}) {
  if (flags.publish || flags.deploy || flags.writeSds) {
    return fail("publish_attempted", "this verifier never publishes a catalog", {
      seeded: flags.seeded || undefined,
    });
  }
  if (flags.checkout || flags.pay || flags.payment) {
    return fail("checkout_touched", "this verifier does not call checkout or payment", {
      seeded: flags.seeded || undefined,
    });
  }
  if (flags.editPrices || flags.editSkus || flags.writePrices) {
    return fail(
      "sku_change_refused",
      "live extract / homepage SKUs must not be edited; this pack only records them",
      { seeded: "sku_change_refused" },
    );
  }

  if (!repoRoot) {
    return fail("committed_surfaces_unavailable", "existing committed SKU files were not found");
  }
  const paths = committedPaths(repoRoot);
  for (const [key, p] of Object.entries(paths)) {
    if (!existsSync(p)) {
      return fail("committed_surfaces_unavailable", `missing ${key} at ${p}`, { path: p });
    }
  }

  let authoritative;
  try {
    authoritative = await loadAuthoritativeOffers(paths.pricing);
  } catch (err) {
    return fail("committed_surfaces_unavailable", err.message);
  }

  const pricingSrc = readFileSync(paths.pricing, "utf8");
  const recorded = {
    path: AUTHORITATIVE_REL,
    sha256: sha256Text(pricingSrc),
    bytes: Buffer.byteLength(pricingSrc),
    skus: authoritative.skus,
  };

  if (mode === "fixture") {
    const raw =
      fixtureRaw != null
        ? String(fixtureRaw)
        : existsSync(fixturePath)
          ? readFileSync(fixturePath, "utf8")
          : null;
    if (raw == null) {
      return fail("committed_surfaces_unavailable", `fixture not found: ${fixturePath}`, {
        path: fixturePath,
      });
    }
    const parsed = parseFixtureDocument(raw);
    if (parsed.kind === "invalid_json") {
      return fail("invalid_json", "fixture is not JSON");
    }
    if (parsed.kind === "invalid_document") {
      return fail("invalid_document", "fixture JSON is not a plain object");
    }

    const document = parsed.document;
    if (isSkuChangeAttempt(document, flags) || flags.editPrices) {
      return fail(
        "sku_change_refused",
        "live extract / homepage SKUs must not be edited; this pack only records them",
        {
          seeded: "sku_change_refused",
          recorded,
        },
      );
    }

    const emptyShape = parsed.kind === "empty" || parsed.advertised.length === 0;

    if (emptyShape) {
      return fail(
        "silent_empty_success",
        "fixture looks like success but advertises no SKUs",
        {
          seeded: "silent_empty_success",
          okField: isPlainObject(document) ? document.ok === true : false,
          advertisedCount: 0,
          recorded,
        },
      );
    }

    const ghosts = collectGhosts(parsed.advertised, authoritative);
    if (ghosts.length > 0) {
      const cls = ghosts[0].class;
      return fail(cls, FAILURES[cls], {
        seeded: cls,
        ghosts,
        advertised: parsed.advertised,
        recorded,
      });
    }

    return honestyEnvelope({
      ok: true,
      schema: VERDICT_SCHEMA,
      verifier: VERIFIER,
      packageId: PACKAGE_ID,
      mode: "fixture",
      advertised: mergeAdvertised(parsed.advertised),
      ghosts: [],
      recorded,
      checks: {
        ghost_sku: false,
        sku_price_mismatch: false,
        silent_empty_success: false,
        sku_change_refused: false,
      },
    });
  }

  if (mode !== "committed") {
    return fail("usage", `mode must be committed or fixture (got ${mode})`);
  }

  const catalogSrc = readFileSync(paths.catalog, "utf8");
  const llmsSrc = readFileSync(paths.llms, "utf8");
  const catalogRows = parseClientCatalog(catalogSrc);
  const llmsRows = parseLlmsPricedLines(llmsSrc);
  const linkSlugs = parsePaymentLinkSlugs(catalogSrc);

  const linkRows = linkSlugs
    .filter((slug) => slug !== CUSTOM_QUOTE_SLUG)
    .map((slug) => ({
      slug,
      name: authoritative.bySlug[slug]?.label || null,
      amountCents: authoritative.bySlug[slug]?.amountCents ?? null,
      surface: "payment_links",
    }));

  const advertisedRows = [...catalogRows, ...llmsRows, ...linkRows];
  if (advertisedRows.length === 0) {
    return fail("silent_empty_success", "committed surfaces advertised no SKUs", {
      recorded,
    });
  }

  const ghosts = collectGhosts(advertisedRows, authoritative);
  const advertised = mergeAdvertised(
    advertisedRows.map((row) => ({
      ...row,
      slug: resolveSlug(row, authoritative) || row.slug,
    })),
  );
  const advertisedSlugs = new Set(advertised.map((a) => a.slug).filter(Boolean));
  const unadvertised = authoritative.skus
    .filter((s) => !advertisedSlugs.has(s.slug))
    .map((s) => ({
      slug: s.slug,
      amountCents: s.amountCents,
      label: s.label,
      note: "present in server OFFERS; not advertised on homepage catalog / llms Start here / payment_links",
    }));

  const surfaces = {
    pricing: { path: AUTHORITATIVE_REL, sha256: recorded.sha256, bytes: recorded.bytes },
    catalog: {
      path: CLIENT_CATALOG_REL,
      sha256: sha256Text(catalogSrc),
      bytes: Buffer.byteLength(catalogSrc),
    },
    llms: {
      path: LLMS_REL,
      sha256: sha256Text(llmsSrc),
      bytes: Buffer.byteLength(llmsSrc),
    },
  };

  if (ghosts.length > 0) {
    const cls = ghosts[0].class;
    return fail(cls, FAILURES[cls], {
      ghosts,
      advertised,
      unadvertised,
      recorded,
      surfaces,
    });
  }

  return honestyEnvelope({
    ok: true,
    schema: VERDICT_SCHEMA,
    verifier: VERIFIER,
    packageId: PACKAGE_ID,
    mode: "committed",
    advertised,
    ghosts: [],
    unadvertised,
    recorded,
    surfaces,
    checks: {
      ghost_sku: false,
      sku_price_mismatch: false,
      silent_empty_success: false,
      sku_change_refused: false,
    },
  });
}
