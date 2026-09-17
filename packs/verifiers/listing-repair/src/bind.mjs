import {
  BIND_SCHEMA,
  LISTING_INPUT_SCHEMA,
  PACKET_SCHEMA,
  SOURCE_SCHEMA,
} from "./constants.mjs";
import { normalizeDigest, normalizePacketDigest, snapshotDigest } from "./digest.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isListingInput(value) {
  if (!isPlainObject(value)) return false;
  if (value.schema === LISTING_INPUT_SCHEMA) return true;
  return Boolean(value.identity && value.record?.routeRegressionInput);
}

export function isSourceObservation(value) {
  if (!isPlainObject(value)) return false;
  if (value.schema === SOURCE_SCHEMA) return isPlainObject(value.snapshot);
  return isPlainObject(value.snapshot) && (value.digest || value.observedAt || value.boundDigest);
}

export function listingSnapshot(source) {
  if (!isPlainObject(source)) return null;
  if (isSourceObservation(source)) return source.snapshot;
  if (isListingInput(source)) return source;
  return null;
}

function pushRoutePath(set, route) {
  if (typeof route === "string" && route.trim()) {
    set.add(route.trim());
    return;
  }
  if (!isPlainObject(route)) return;
  const path = route.path || route.route;
  if (typeof path === "string" && path.trim()) set.add(path.trim());
}

export function extractRoutePaths(snapshot) {
  const paths = new Set();
  if (!isPlainObject(snapshot)) return paths;

  const rr = snapshot.record?.routeRegressionInput;
  for (const side of ["baseline", "current"]) {
    const routes = rr?.[side]?.routes;
    if (Array.isArray(routes)) {
      for (const route of routes) pushRoutePath(paths, route);
    }
  }

  const routes = snapshot.routes;
  if (Array.isArray(routes)) {
    for (const route of routes) pushRoutePath(paths, route);
  } else if (isPlainObject(routes)) {
    for (const key of Object.keys(routes)) {
      if (key.startsWith("/")) paths.add(key);
      pushRoutePath(paths, routes[key]);
    }
  }

  return paths;
}

export function observedAtOf(source, snapshot) {
  if (isPlainObject(source) && typeof source.observedAt === "string" && source.observedAt.trim()) {
    return source.observedAt.trim();
  }
  if (isPlainObject(snapshot) && typeof snapshot.clock === "string" && snapshot.clock.trim()) {
    return snapshot.clock.trim();
  }
  const current = snapshot?.record?.routeRegressionInput?.current?.capturedAt;
  if (typeof current === "string" && current.trim()) return current.trim();
  return null;
}

/**
 * Bind a 1.4.7 listing input (or source-observation wrapper) to digest facts.
 * boundDigest is the snapshot digest at packet generation; computed is now.
 */
export function bindSource(source, bind = null) {
  const snapshot = listingSnapshot(source);
  if (!snapshot) {
    return {
      ok: false,
      snapshot: null,
      computed: null,
      declared: null,
      bound: null,
      observedAt: null,
      routes: new Set(),
    };
  }

  const computed = snapshotDigest(snapshot);
  const declaredFromSource = isSourceObservation(source) ? normalizeDigest(source.digest) : null;
  const declared = declaredFromSource || computed;
  const boundFromSource = isPlainObject(source) ? normalizeDigest(source.boundDigest) : null;
  const boundFromBind = isPlainObject(bind) ? normalizeDigest(bind.sourceDigest) : null;
  const bound = boundFromBind || boundFromSource || declared;

  return {
    ok: true,
    snapshot,
    computed,
    declared,
    bound,
    observedAt: observedAtOf(source, snapshot),
    routes: extractRoutePaths(snapshot),
  };
}

export function bindPacketDigest(packet, bind = null) {
  const claimed = isPlainObject(packet) ? normalizePacketDigest(packet.digest) : null;
  const fromBind = isPlainObject(bind) ? normalizePacketDigest(bind.packetDigest) : null;
  return { claimed, fromBind };
}

export function wrapListingAsSource(listing, extra = {}) {
  const snapshot = listingSnapshot(listing) || listing;
  const digest = snapshotDigest(snapshot);
  return {
    schema: SOURCE_SCHEMA,
    observedAt: observedAtOf(listing, snapshot),
    digest,
    boundDigest: extra.boundDigest || digest,
    snapshot,
    ...extra,
  };
}

export function makeBindRecord({ packet, source, kit = null } = {}) {
  const bound = bindSource(source);
  return {
    schema: BIND_SCHEMA,
    kit: kit || null,
    job: isPlainObject(packet) ? packet.appId : null,
    packetSchema: isPlainObject(packet) ? packet.schema || PACKET_SCHEMA : PACKET_SCHEMA,
    packetDigest: isPlainObject(packet) ? packet.digest || null : null,
    sourceDigest: bound.computed,
    observedAt: bound.observedAt,
  };
}
