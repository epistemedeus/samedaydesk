import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { LIVE_PRICE_FILES, PUBLIC_CATALOG_PREFIXES, REPO_ROOT } from "./pins.mjs";

function posixRel(abs) {
  const rel = relative(REPO_ROOT, resolve(abs));
  return rel.split("\\").join("/");
}

export function isInsideRepo(abs) {
  const rel = posixRel(abs);
  return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith("/");
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

export function isLivePricePath(filePath) {
  if (!filePath) return false;
  const abs = resolve(filePath);
  if (!isInsideRepo(abs)) return false;
  const rel = posixRel(abs);
  return LIVE_PRICE_FILES.includes(rel);
}

export function classifyWritePath(filePath) {
  if (!filePath) return { ok: true };
  const abs = resolve(filePath);
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
      code: "public_catalog_write_rejected",
      message: "Refusing to write refresh or case bytes to a public catalog path",
      path: posixRel(abs),
    };
  }
  return { ok: true, path: existsSync(abs) ? posixRel(abs) : abs };
}

export function refusePublishCase(request) {
  const dest = request?.publishCase || request?.catalogPath || request?.copyCaseTo;
  if (!dest) return null;
  return {
    ok: false,
    refused: true,
    code: "public_catalog_write_rejected",
    message: "This tool does not copy case bytes to a catalog or public path",
    path: String(dest),
  };
}
