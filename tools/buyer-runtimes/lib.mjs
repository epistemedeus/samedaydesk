import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export {
  BASE_NETWORK_LABELS,
  CIRCLE_USDC_BASE,
  FIXTURE_ROOT,
  REASONS,
  RUNTIMES,
  STATES,
  assertUnpaidRequest,
  collectStrings,
  contractFrom402,
  evmAddr,
  listRuntimeDirs,
  loadCatalog,
  loadRuntime,
  parse402Usd,
  pickPayableAccept,
  readJson,
  verify,
} from "@samedaydesk/buyer-evidence";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "../..");

export function mcpTools() {
  const src = readFileSync(join(ROOT, "client/src/pages/Mcp.tsx"), "utf8");
  const start = src.indexOf("const tools = [");
  const end = src.indexOf("];", start);
  if (start < 0 || end <= start) throw new Error("Mcp.tsx tools array not found");
  const block = src.slice(start, end);
  const names = [...block.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
  const prices = [...block.matchAll(/price:\s*"\$([0-9.]+)"/g)].map((m) => Number(m[1]));
  if (names.length !== prices.length) throw new Error("Mcp.tsx name/price pair mismatch");
  return names.map((name, i) => ({ name, price: prices[i] }));
}

export async function fetchWithTimeout(url, init = {}, ms = 20000) {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(ms) });
}
