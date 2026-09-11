import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_ADAPTERS } from "./adapters/index.mjs";
import { httpGet } from "./http.mjs";
import { nowIso } from "./clock.mjs";
import { sha256Bytes } from "./hash.mjs";

export async function liveCapture({
  outDir,
  limit = 5,
  now,
  httpGet: get = httpGet,
  adapters = ALL_ADAPTERS,
} = {}) {
  const at = nowIso(now);
  mkdirSync(outDir, { recursive: true });
  const captures = [];
  for (const adapter of adapters) {
    const result = await adapter.fetchList({
      mode: "live",
      now: at,
      limit,
      httpGet: get,
    });
    const file = join(outDir, `${adapter.name}.json`);
    const body = {
      dataLabel: "live-capture",
      capturedAt: result.fetchMeta?.fetchedAt || at,
      adapter: adapter.name,
      liveUrl: adapter.liveUrl,
      fetchMeta: result.fetchMeta,
      listingMeta: result.listingMeta,
      error: result.error,
      recordCount: (result.records || []).length,
      records: result.records,
    };
    const json = JSON.stringify(body, null, 2) + "\n";
    writeFileSync(file, json);
    captures.push({
      adapter: adapter.name,
      path: file,
      bytes: Buffer.byteLength(json),
      sha256: sha256Bytes(Buffer.from(json)),
      httpStatus: result.fetchMeta?.httpStatus ?? null,
      error: result.error,
      recordCount: body.recordCount,
    });
  }
  const index = {
    dataLabel: "live-capture",
    capturedAt: at,
    limit,
    bounded: true,
    crawl: false,
    captures,
  };
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}
