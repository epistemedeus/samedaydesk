import { fail, isFailure } from "./failures.mjs";
import { parseCatalogDocument, parseDiscoveryDocument, parseLlmsPointer } from "./parse-offer.mjs";
import { fetchSurface, findRepoRoot, readCommittedSurface, readFixtureFile } from "./read.mjs";
import { SURFACES } from "./surfaces.mjs";

function surfaceRecord(read) {
  if (isFailure(read)) {
    return {
      ok: false,
      failure: read.failure,
    };
  }
  return {
    ok: true,
    source: read.source,
    url: read.url || null,
    path: read.path || null,
    status: read.status ?? null,
    bytes: read.bytes,
    sha256: read.sha256,
  };
}

function success({ mode, offer, surfaces, catalog, llms }) {
  return {
    ok: true,
    client: "e4-maintained-runtime",
    mode,
    paid: false,
    newDiscoveryFramework: false,
    homepageRewrite: false,
    offer,
    surfaces,
    catalog: catalog || null,
    llms: llms || null,
  };
}

/**
 * Maintained client: read existing discovery + catalog + llms pointer.
 * Never returns ok:true without a named useful-jobs offer.
 */
export async function discoverOffer({
  mode = "committed",
  fixturePath = null,
  fetchImpl = fetch,
  repoRoot = findRepoRoot(),
} = {}) {
  if (mode === "fixture" || fixturePath) {
    const read = readFixtureFile(fixturePath);
    if (isFailure(read)) return { ...read, client: "e4-maintained-runtime", mode: "fixture" };
    const parsed = parseDiscoveryDocument(read.body, { httpStatus: 200, source: fixturePath });
    if (isFailure(parsed)) {
      return {
        ...parsed,
        client: "e4-maintained-runtime",
        mode: "fixture",
        surfaces: { discovery: surfaceRecord(read) },
      };
    }
    return success({
      mode: "fixture",
      offer: parsed.offer,
      surfaces: { discovery: surfaceRecord(read) },
    });
  }

  if (mode !== "committed" && mode !== "live") {
    return fail("usage", `mode must be committed, live, or fixture (got ${mode})`);
  }

  let discoveryRead;
  let catalogRead;
  let llmsRead;
  if (mode === "committed") {
    if (!repoRoot) {
      return fail("committed_surfaces_unavailable", "existing committed public files not found");
    }
    discoveryRead = readCommittedSurface(SURFACES.discovery, repoRoot);
    catalogRead = readCommittedSurface(SURFACES.catalog, repoRoot);
    llmsRead = readCommittedSurface(SURFACES.llms, repoRoot);
  } else {
    [discoveryRead, catalogRead, llmsRead] = await Promise.all([
      fetchSurface(SURFACES.discovery, { fetchImpl }),
      fetchSurface(SURFACES.catalog, { fetchImpl }),
      fetchSurface(SURFACES.llms, { fetchImpl }),
    ]);
  }

  const surfaces = {
    discovery: surfaceRecord(discoveryRead),
    catalog: surfaceRecord(catalogRead),
    llms: surfaceRecord(llmsRead),
  };

  if (isFailure(discoveryRead)) {
    return { ...discoveryRead, client: "e4-maintained-runtime", mode, surfaces };
  }

  const parsed = parseDiscoveryDocument(discoveryRead.body, {
    httpStatus: discoveryRead.status,
    source: discoveryRead.url || discoveryRead.path,
  });
  if (isFailure(parsed)) {
    return { ...parsed, client: "e4-maintained-runtime", mode, surfaces };
  }

  if (isFailure(catalogRead)) {
    return { ...catalogRead, client: "e4-maintained-runtime", mode, surfaces };
  }
  const catalog = parseCatalogDocument(catalogRead.body, parsed.offer.jobs, {
    source: catalogRead.url || catalogRead.path,
  });
  if (isFailure(catalog)) {
    return { ...catalog, client: "e4-maintained-runtime", mode, surfaces };
  }
  if (catalog.catalog.version !== parsed.offer.version) {
    return {
      ...fail("catalog_invalid", "catalog version does not match discovery version", {
        discoveryVersion: parsed.offer.version,
        catalogVersion: catalog.catalog.version,
      }),
      client: "e4-maintained-runtime",
      mode,
      surfaces,
    };
  }

  if (isFailure(llmsRead)) {
    return { ...llmsRead, client: "e4-maintained-runtime", mode, surfaces };
  }
  const llms = parseLlmsPointer(llmsRead.body, { source: llmsRead.url || llmsRead.path });
  if (isFailure(llms)) {
    return { ...llms, client: "e4-maintained-runtime", mode, surfaces };
  }

  return success({
    mode,
    offer: {
      ...parsed.offer,
      firstOffer: catalog.catalog.firstOffer || parsed.offer.firstOffer,
    },
    surfaces,
    catalog: catalog.catalog,
    llms: llms.llms,
  });
}
