import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_NOW } from "../src/constants.mjs";
import { ingestAll } from "../src/ingest.mjs";
import { ALL_ADAPTERS, adapters } from "../src/adapters/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK = join(here, "..");
export const FIX = join(PACK, "fixtures/labelled");

export { TEST_NOW };

export async function ingestDefault(overrides = {}) {
  return ingestAll({
    mode: "fixture",
    fixtureDir: FIX,
    now: TEST_NOW,
    limit: 5,
    ...overrides,
  });
}

export async function ingestAdapter(name, file, extra = {}) {
  const adapter = adapters[name];
  return adapter.fetchList({
    mode: "fixture",
    fixturePath: join(FIX, file),
    now: TEST_NOW,
    limit: 10,
    ...extra,
  });
}

export function mockHttp(handler) {
  return async (url, opts = {}) => handler(url, opts);
}

export { ALL_ADAPTERS };
