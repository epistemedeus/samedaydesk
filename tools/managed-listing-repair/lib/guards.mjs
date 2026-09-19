import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  FORBIDDEN_WRITE_PREFIXES,
  LIVE_PRICE_FILES,
  PUBLIC_CATALOG_PREFIXES,
  REPO_ROOT,
  F08_OWNED_PREFIX,
  WRITE_BOUNDARY_PREFIX,
} from "./pins.mjs";

function posixRel(abs) {
  const rel = relative(REPO_ROOT, resolve(abs));
  return rel.split("\\").join("/");
}

export function isInsideRepo(abs) {
  const rel = posixRel(abs);
  return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith("/");
}

export function isLivePricePath(filePath) {
  if (!filePath) return false;
  const abs = resolve(filePath);
  if (!isInsideRepo(abs)) return false;
  return LIVE_PRICE_FILES.includes(posixRel(abs));
}

export function isPublicCatalogPath(filePath) {
  if (!filePath) return false;
  const abs = resolve(filePath);
  if (!isInsideRepo(abs)) return false;
  const rel = posixRel(abs);
  return PUBLIC_CATALOG_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return rel === prefix.slice(0, -1) || rel.startsWith(prefix);
    return rel === prefix || rel.startsWith(`${prefix}/`);
  });
}

export function isF08Path(filePath) {
  if (!filePath) return false;
  const abs = resolve(filePath);
  if (!isInsideRepo(abs)) return false;
  const rel = posixRel(abs);
  return rel === F08_OWNED_PREFIX.slice(0, -1) || rel.startsWith(F08_OWNED_PREFIX);
}

export function isForbiddenWritePath(filePath) {
  if (!filePath) return false;
  const abs = resolve(filePath);
  if (!isInsideRepo(abs)) return false;
  const rel = posixRel(abs);
  return FORBIDDEN_WRITE_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix));
}

export function classifyWritePath(filePath) {
  if (!filePath) return { ok: true };
  const abs = resolve(filePath);
  if (isF08Path(abs) || isForbiddenWritePath(abs)) {
    return {
      ok: false,
      code: "f08_edit_rejected",
      message: "Managed listing repair does not edit F08 paid wrappers, homepage, or sibling owned directories",
      path: posixRel(abs),
    };
  }
  if (isLivePricePath(abs)) {
    return {
      ok: false,
      code: "live_price_mutation_rejected",
      message: "Refusing to write a live SDS price or catalog pin file",
      path: posixRel(abs),
    };
  }
  if (isPublicCatalogPath(abs)) {
    return {
      ok: false,
      code: "bazaar_publish_rejected",
      message: "Refusing to publish listing repair output to a live catalog or Bazaar path",
      path: posixRel(abs),
    };
  }
  if (isInsideRepo(abs) && !isWriteBoundaryPath(abs)) {
    return {
      ok: false,
      code: "write_boundary_rejected",
      message: "Refusing to write outside tools/managed-listing-repair/",
      path: posixRel(abs),
    };
  }
  return { ok: true, path: existsSync(abs) ? posixRel(abs) : abs };
}

export function isWriteBoundaryPath(filePath) {
  if (!filePath) return false;
  const abs = resolve(filePath);
  if (!isInsideRepo(abs)) return false;
  const rel = posixRel(abs);
  return rel === WRITE_BOUNDARY_PREFIX.slice(0, -1) || rel.startsWith(WRITE_BOUNDARY_PREFIX);
}

export function wantsAutoPublish(request, caseObject) {
  const packet = caseObject?.packet;
  return (
    request?.publish === true ||
    request?.autoPublish === true ||
    request?.publishAuthorized === true ||
    request?.bazaarPublish === true ||
    caseObject?.publishAuthorized === true ||
    caseObject?.publish_authorized === true ||
    caseObject?.publish === true ||
    packet?.publish === true ||
    packet?.autoPublish === true ||
    packet?.publishAuthorized === true ||
    packet?.publish_authorized === true ||
    packet?.status === "published" ||
    packet?.disposition === "published"
  );
}

export function wantsF08Edit(request) {
  return (
    request?.editF08 === true ||
    request?.writeF08 === true ||
    Boolean(request?.f08Path)
  );
}

export function isNoopPacket(packet) {
  const changes = Array.isArray(packet?.changes) ? packet.changes : [];
  if (!changes.length) return true;
  return changes.every((change) => {
    if (!change || typeof change !== "object") return true;
    return Object.is(change.from, change.to);
  });
}

export function countChangedFields(packet) {
  const changes = Array.isArray(packet?.changes) ? packet.changes : [];
  return changes.filter((change) => change && typeof change === "object" && !Object.is(change.from, change.to))
    .length;
}

/** Route-shaped fields must appear in engine sourceRefs/notes; other fields must appear as the field name. */
export function suggestionGroundedInEngine(changes, actions) {
  const hay = (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const refs = Array.isArray(action?.sourceRefs) ? action.sourceRefs.join("\n") : "";
      return `${refs}\n${action?.note || ""}`;
    })
    .join("\n")
    .toLowerCase();
  if (!hay) return false;
  const list = Array.isArray(changes) ? changes : [];
  if (!list.length) return false;
  return list.every((change) => {
    const field = String(change?.field || "");
    if (!field) return false;
    const route = field.match(/^routes\.(\/[^.]+)/);
    if (route) return hay.includes(route[1].toLowerCase());
    return hay.includes(field.toLowerCase());
  });
}
