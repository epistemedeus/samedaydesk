import { HOME_CANONICAL, HOME_PATH, HOME_TITLE, SITE_ORIGIN } from "./constants.mjs";
import { refused } from "./errors.mjs";

function refuseHome(detail) {
  refused("homepage_rewrite_refused", "Homepage path / is not a crawler shell and cannot be rewritten by this job", detail);
}

/**
 * SDS crawler-shell path identity.
 * Trailing slash and percent-encoding are not distinct routes.
 * Query, hash, empty, '.', and '..' segments are invalid, not silently merged.
 */
export function normalizeRoutePath(path, options = {}) {
  const allowHome = options.allowHome === true;
  if (path == null || path === "") {
    refused("pathless_record", "Path-less route records are refused", { path });
  }
  if (typeof path !== "string" || path.trim() === "") {
    refused("pathless_record", "Path-less route records are refused", { path });
  }
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    refused("invalid_path", `Route path must start with /: ${trimmed}`, { path: trimmed });
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    refused("invalid_path", "Route path must be exact and extensionless (no query or hash)", {
      path: trimmed,
    });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    refused("invalid_path", `Route path has invalid percent-encoding: ${trimmed}`, { path: trimmed });
  }
  if (decoded.includes("?") || decoded.includes("#")) {
    refused("invalid_path", "Route path must be exact and extensionless (no query or hash)", {
      path: decoded,
    });
  }

  const segments = decoded.split("/");
  const trailingSlash = segments.length > 2 && segments[segments.length - 1] === "";
  const body = trailingSlash ? segments.slice(1, -1) : segments.slice(1);

  if (body.length === 0 || (body.length === 1 && body[0] === "")) {
    if (!allowHome) refuseHome({ path: HOME_PATH });
    return HOME_PATH;
  }

  for (const seg of body) {
    if (seg === "" || seg === "." || seg === "..") {
      refused("invalid_path", "Route path must be exact (no empty, '.', or '..' segments)", {
        path: decoded,
      });
    }
  }

  const normalized = `/${body.join("/")}`;
  if (normalized === HOME_PATH && !allowHome) refuseHome({ path: normalized });
  return normalized;
}

function originOf(url) {
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${url.hostname}${port}`;
}

/**
 * Canonical identity for SDS comparison.
 * WHATWG URL parsing plus pathname identity (trailing slash / percent-encoding).
 * Query and hash remain distinct. Unlike origins are not forced equal.
 */
export function canonicalIdentity(canonical, options = {}) {
  const pathForError = options.path || null;
  if (canonical == null || canonical === "") {
    refused("missing_canonical", `Route ${pathForError || "(unknown)"} is missing canonical`, { path: pathForError });
  }
  if (typeof canonical !== "string" || canonical.trim().length === 0) {
    refused("missing_canonical", `Route ${pathForError || "(unknown)"} is missing canonical`, { path: pathForError });
  }

  let url;
  try {
    url = new URL(canonical.trim());
  } catch {
    refused("invalid_canonical", `Route ${pathForError || "(unknown)"} canonical is not a URL`, {
      path: pathForError,
      canonical,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    refused("invalid_canonical", `Route ${pathForError || "(unknown)"} canonical must be an http(s) URL`, {
      path: pathForError,
      canonical,
    });
  }
  if (url.username || url.password) {
    refused("invalid_canonical", `Route ${pathForError || "(unknown)"} canonical must not include credentials`, {
      path: pathForError,
      canonical,
    });
  }

  const pathname = normalizeRoutePath(url.pathname || "/", { allowHome: true });
  const identity = `${originOf(url)}${pathname}${url.search}${url.hash}`;
  const homeLike =
    pathname === HOME_PATH &&
    url.search === "" &&
    url.hash === "" &&
    (identity === HOME_CANONICAL || originOf(url) === SITE_ORIGIN || url.origin === SITE_ORIGIN);
  if (homeLike) {
    refused("homepage_rewrite_refused", "Catalog claims homepage canonical; this job does not rewrite the homepage", {
      path: pathForError,
      canonical: identity,
    });
  }
  return identity;
}

export function assertNotHomeTitle(title, path) {
  if (typeof title === "string" && title.trim() === HOME_TITLE) {
    refused("homepage_rewrite_refused", "Catalog reuses homepage title; this job does not rewrite the homepage", {
      path,
      title,
    });
  }
}

export function routeIdentityKey(route) {
  if (route.kind === "express") return route.matchKey;
  return JSON.stringify({
    path: route.path,
    canonical: route.canonical,
    title: route.title,
    robots: route.robots ?? null,
  });
}

export function compareRouteIdentity(a, b) {
  if (a.kind === "express" || b.kind === "express") {
    const ak = routeIdentityKey(a);
    const bk = routeIdentityKey(b);
    if (ak !== bk) return ak < bk ? -1 : 1;
    return 0;
  }
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.canonical !== b.canonical) return a.canonical < b.canonical ? -1 : 1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  const ar = a.robots ?? "";
  const br = b.robots ?? "";
  if (ar !== br) return ar < br ? -1 : 1;
  return 0;
}
