import { CANONICAL_RESOURCES } from "./canonical-resources.js";
import {
  CANONICAL_SURFACE,
  DISTRIBUTION_SURFACES,
  isDistributionSurface,
  listingMountPath,
} from "./distribution-surfaces.js";

const LISTING_PATH_PATTERN = /^\/listings\/([^/]+)(\/.*)?$/;

export function resolveListingPath(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const pathOnly = pathname.split("?")[0].split("#")[0];
  const match = LISTING_PATH_PATTERN.exec(pathOnly);
  if (!match) {
    const resource = CANONICAL_RESOURCES.find((entry) => (
      pathOnly === entry.path || pathOnly.startsWith(`${entry.path}/`)
    ));
    if (!resource) return { ok: false, reason: "not_a_listing" };
    return {
      ok: true,
      surface: CANONICAL_SURFACE,
      resource,
      listingPath: resource.path,
      canonicalPath: resource.path,
      remainder: pathOnly.slice(resource.path.length) || "/",
    };
  }

  const surface = match[1];
  const remainder = match[2] || "/";
  if (!isDistributionSurface(surface)) {
    return { ok: false, reason: "unknown_surface", surface };
  }

  const ranked = [...CANONICAL_RESOURCES]
    .filter((entry) => remainder === entry.path || remainder.startsWith(`${entry.path}/`))
    .sort((left, right) => right.path.length - left.path.length);
  const resource = ranked[0];
  if (!resource) return { ok: false, reason: "unknown_resource", surface };

  return {
    ok: true,
    surface,
    resource,
    listingPath: listingMountPath(surface, resource.path),
    canonicalPath: resource.path,
    remainder: remainder.slice(resource.path.length) || "/",
  };
}

export function listingCatalog({ origin = "https://samedaydesk.com" } = {}) {
  return {
    origin,
    surfaces: [...DISTRIBUTION_SURFACES],
    resources: CANONICAL_RESOURCES.map((resource) => ({
      id: resource.id,
      canonicalPath: resource.path,
      summary: resource.summary,
      listings: Object.fromEntries(
        DISTRIBUTION_SURFACES.map((surface) => [
          surface,
          `${origin}${listingMountPath(surface, resource.path)}`,
        ]),
      ),
    })),
  };
}

function stampListing(surface, resource) {
  return function listingContext(req, _res, next) {
    req.listing = {
      surface,
      resource,
      listingPath: listingMountPath(surface, resource.path),
      canonicalPath: resource.path,
    };
    next();
  };
}

export function mountResourceAliases(app, handlers) {
  if (!app || typeof app.use !== "function") {
    throw new Error("mountResourceAliases requires an Express app");
  }
  for (const resource of CANONICAL_RESOURCES) {
    const handler = handlers[resource.handler];
    if (typeof handler !== "function") {
      throw new Error(`missing handler for canonical resource ${resource.id}`);
    }
    for (const surface of DISTRIBUTION_SURFACES) {
      app.use(listingMountPath(surface, resource.path), stampListing(surface, resource), handler);
    }
  }
  return app;
}

export function mountListingCatalog(app, { origin } = {}) {
  app.get("/listings", (_req, res) => {
    res.type("application/json").json(listingCatalog({ origin }));
  });
  app.use("/listings", (_req, res) => {
    res.status(404).type("application/json").json({ error: "Unknown listing path" });
  });
  return app;
}
