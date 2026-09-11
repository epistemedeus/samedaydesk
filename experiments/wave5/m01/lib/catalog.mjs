import { readFileSync } from "node:fs";
import { CATALOG_PATH } from "./paths.mjs";

export class CatalogRefuse extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function loadCatalog(path = CATALOG_PATH) {
  const catalog = JSON.parse(readFileSync(path, "utf8"));
  if (catalog.schema !== "samedaydesk.wave5.m01.engine-catalog.v1") {
    throw new CatalogRefuse("invalid_catalog", "Unsupported catalog schema", { schema: catalog.schema });
  }
  if (!Array.isArray(catalog.engines) || catalog.engines.length === 0) {
    throw new CatalogRefuse("invalid_catalog", "Catalog has no engines");
  }
  const ids = catalog.engines.map((engine) => engine.id);
  if (new Set(ids).size !== ids.length) {
    throw new CatalogRefuse("duplicate_engine_id", "Catalog engine ids must be unique", { ids });
  }
  const first = catalog.engines.find((engine) => engine.id === catalog.firstOffer);
  if (!first || first.firstOffer !== true || first.selected !== true) {
    throw new CatalogRefuse("invalid_first_offer", "firstOffer must be a selected engine with firstOffer true", {
      firstOffer: catalog.firstOffer,
    });
  }
  const firstCount = catalog.engines.filter((engine) => engine.firstOffer).length;
  if (firstCount !== 1) {
    throw new CatalogRefuse("invalid_first_offer", "Exactly one engine may be firstOffer", { firstCount });
  }
  return catalog;
}

export function selectedEngines(catalog = loadCatalog()) {
  return catalog.engines.filter((engine) => engine.selected === true);
}

export function getEngine(id, catalog = loadCatalog()) {
  const engine = catalog.engines.find((row) => row.id === id);
  if (!engine) {
    throw new CatalogRefuse("unknown-engine", `unknown engine ${id}`, {
      id,
      known: catalog.engines.map((row) => row.id),
    });
  }
  return engine;
}

export function firstOffer(catalog = loadCatalog()) {
  return getEngine(catalog.firstOffer, catalog);
}
