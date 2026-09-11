import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ALL_ADAPTERS } from "./adapters/index.mjs";
import { httpGet } from "./http.mjs";
import { nowIso } from "./clock.mjs";
import { reconcile } from "./reconcile.mjs";
import { attachExperience } from "./experience.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");

export const DEFAULT_FIXTURES = {
  moltjobs: "fixtures/labelled/moltjobs-list.open.fixture.json",
  frantic: "fixtures/labelled/frantic-board.open.fixture.json",
  "github-issues": "fixtures/labelled/github-issues.open.fixture.json",
  "neomorphic-schedule": "fixtures/labelled/neomorphic-schedule.fixture.json",
  moltbook: "fixtures/labelled/moltbook-inaccessible.fixture.json",
};

export function fixturePathFor(adapterName, fixtureDir, packRoot = PACK_ROOT) {
  const rel = DEFAULT_FIXTURES[adapterName];
  if (!rel) return null;
  if (fixtureDir) {
    const base = rel.split("/").pop();
    const p = join(fixtureDir, base);
    if (existsSync(p)) return p;
  }
  return join(packRoot, rel);
}

export async function ingestAll({
  mode = "fixture",
  fixtureDir,
  now,
  limit = 5,
  httpGet: get = httpGet,
  adapters = ALL_ADAPTERS,
  experienceOverlays = [],
  extraFixturePaths = [],
} = {}) {
  const observedAt = nowIso(now);
  const adapterResults = [];
  for (const adapter of adapters) {
    const fixturePath =
      mode === "fixture" ? fixturePathFor(adapter.name, fixtureDir) : undefined;
    const result = await adapter.fetchList({
      mode,
      fixturePath,
      now: observedAt,
      limit,
      httpGet: get,
    });
    adapterResults.push(result);
  }

  for (const extra of extraFixturePaths) {
    const adapter = adapters.find((a) => a.name === extra.adapter);
    if (!adapter) continue;
    const result = await adapter.fetchList({
      mode: "fixture",
      fixturePath: extra.path,
      now: observedAt,
      limit,
      httpGet: get,
    });
    adapterResults.push(result);
  }

  let records = adapterResults.flatMap((r) => r.records || []);
  for (const overlay of experienceOverlays) {
    records = records.map((rec) => attachExperience(rec, overlay));
  }
  const reconciled = reconcile(records);
  return {
    at: observedAt,
    mode,
    adapterResults: adapterResults.map((r) => ({
      adapter: r.adapter,
      fetchMeta: r.fetchMeta,
      listingMeta: r.listingMeta,
      error: r.error,
      recordCount: (r.records || []).length,
    })),
    records: reconciled.records,
    reconcile: {
      droppedExactDuplicates: reconciled.droppedExactDuplicates,
      termsDrift: reconciled.termsDrift,
      possibleDuplicates: reconciled.possibleDuplicates,
    },
  };
}
