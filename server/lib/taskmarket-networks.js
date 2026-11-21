// Public metadata only. Never follow task-supplied URLs/RPCs or forward credentials.
export const TASKMARKET_NETWORK_INFO = "https://api.taskmarket.dev/trpc/network.info";
export const TASKMARKET_METADATA_TTL_MS = 300_000;
export const TASKMARKET_DECIMAL_AUTHORITY = "https://docs.taskmarket.dev/getting-started/networks-and-fees";
const ADDRESS = /^0x(?!0{40}$)[a-fA-F0-9]{40}$/;
const cache = new WeakMap();

// Decimals are qualified by chain AND exact token identity, never by symbol.
// OUSD's exact address and decimals: https://docs.taskmarket.dev/reference/tempo
// Base USDC address: https://docs.taskmarket.dev/reference/network
const documented = {
  8453: { symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", protocol: "x402", method: "eip3009", decimals: 6, cli: "base" },
  4217: { symbol: "OUSD", address: "0x20c0000000000000000000006a37da5c996874be", protocol: "mpp", method: "mpp-tempo", decimals: 6, cli: null },
};

export function chainId(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function rawAmount(value, label = "amount") {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) {
    throw new Error(`${label} must be an exact nonnegative integer string (at most 78 digits)`);
  }
  return value;
}

export async function publicJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 8_000, maxBytes = 2_097_152 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET", redirect: "error", credentials: "omit",
      headers: { accept: "application/json", "user-agent": "SameDayDesk-TaskMarket/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TaskMarket returned HTTP ${response.status}`);
    if (Number(response.headers?.get?.("content-length")) > maxBytes) throw new Error("TaskMarket response exceeds the byte bound");
    let text;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error("TaskMarket response exceeds the byte bound");
          chunks.push(Buffer.from(value));
        }
        text = Buffer.concat(chunks).toString("utf8");
      } finally { await reader.cancel().catch(() => {}); }
    } else {
      text = JSON.stringify(await response.json());
      if (Buffer.byteLength(text || "") > maxBytes) throw new Error("TaskMarket response exceeds the byte bound");
    }
    try { return JSON.parse(text); } catch { throw new Error("TaskMarket returned invalid JSON"); }
  } finally { clearTimeout(timer); }
}

export function parseNetworkInfo(body, fetchedAt = new Date().toISOString()) {
  const rows = body?.result?.data?.chains;
  if (!Array.isArray(rows) || !rows.length || rows.length > 32) throw new Error("TaskMarket network metadata unavailable or malformed");
  const chains = Object.create(null);
  for (const row of rows) {
    const id = chainId(row?.chainId);
    if (!id || chains[id] || !ADDRESS.test(row.tokenAddress) ||
        typeof row.networkName !== "string" || !/^[a-zA-Z0-9 ()-]{1,80}$/.test(row.networkName) ||
        typeof row.tokenSymbol !== "string" || !/^[a-zA-Z0-9._-]{1,16}$/.test(row.tokenSymbol) ||
        !["x402", "mpp"].includes(row.paymentProtocol) ||
        !["eip3009", "mpp-tempo"].includes(row.paymentMethod) ||
        (row.paymentProtocol === "x402") !== (row.paymentMethod === "eip3009") ||
        (row.tokenDecimals != null && (!Number.isInteger(row.tokenDecimals) || row.tokenDecimals < 0 || row.tokenDecimals > 255))) {
      throw new Error("TaskMarket network metadata malformed or conflicting");
    }
    const known = documented[id];
    if (known && (row.tokenAddress.toLowerCase() !== known.address || row.tokenSymbol !== known.symbol ||
        row.paymentProtocol !== known.protocol || row.paymentMethod !== known.method ||
        (row.tokenDecimals != null && row.tokenDecimals !== known.decimals))) {
      throw new Error("TaskMarket network metadata conflicts with documented asset identity or decimals");
    }
    chains[id] = {
      chain_id: id, network: row.networkName, token_address: row.tokenAddress,
      symbol: row.tokenSymbol, decimals: known?.decimals ?? null,
      decimals_source: known ? TASKMARKET_DECIMAL_AUTHORITY : null,
      payment_protocol: row.paymentProtocol, payment_method: row.paymentMethod,
      cli_network: known?.cli ?? null,
    };
  }
  return { source: TASKMARKET_NETWORK_INFO, fetched_at: fetchedAt, max_age_ms: TASKMARKET_METADATA_TTL_MS, chains };
}

export async function taskMarketMetadata(deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.metadataNowMs || Date.now;
  let entry = cache.get(fetchImpl);
  if (entry?.value && now() < entry.expiresAt) return entry.value;
  if (entry?.pending) return entry.pending;
  entry = {};
  cache.set(fetchImpl, entry);
  entry.pending = (async () => {
    try {
      const value = parseNetworkInfo(await publicJson(TASKMARKET_NETWORK_INFO, { ...deps, fetchImpl, maxBytes: 65_536 }), new Date(now()).toISOString());
      entry.value = value;
      entry.expiresAt = now() + TASKMARKET_METADATA_TTL_MS;
      return value;
    } catch {
      cache.delete(fetchImpl);
      throw new Error("TaskMarket network metadata unavailable, malformed or conflicting; retry the public read later");
    } finally { delete entry.pending; }
  })();
  return entry.pending;
}

export function taskAsset(task, metadata) {
  const id = chainId(task?.chainId);
  const asset = id && metadata?.chains[id];
  // A missing legacy chain is unknown even if only Base is currently served.
  if (!asset) return { chain_id: id, network: null, token_address: null, symbol: null, decimals: null, decimals_source: null, payment_protocol: null, payment_method: null, metadata_status: id ? "chain_not_served" : "chain_unknown" };
  for (const [key, expected] of [["tokenAddress", asset.token_address], ["tokenSymbol", asset.symbol], ["tokenDecimals", asset.decimals]]) {
    if (task[key] != null && (key === "tokenAddress" ? String(task[key]).toLowerCase() !== expected.toLowerCase() : task[key] !== expected)) {
      return { chain_id: id, network: null, token_address: null, symbol: null, decimals: null, decimals_source: null, payment_protocol: null, payment_method: null, metadata_status: "task_metadata_conflict" };
    }
  }
  const { cli_network, ...publicAsset } = asset;
  return { ...publicAsset, metadata_status: "served" };
}

export function amount(value, asset, label) {
  const raw = rawAmount(value, label);
  let display = null;
  if (asset.decimals != null) {
    const canonical = BigInt(raw).toString();
    const padded = canonical.padStart(asset.decimals + 1, "0");
    const fraction = padded.slice(-asset.decimals).replace(/0+$/, "");
    display = asset.decimals === 0 ? canonical : padded.slice(0, -asset.decimals) + (fraction ? `.${fraction}` : "");
  }
  return { base_units: raw, amount: display, decimals_known: asset.decimals != null };
}

export function isBaseUsdc(asset) {
  return asset.chain_id === 8453 && asset.metadata_status === "served" && asset.symbol === "USDC" && asset.token_address?.toLowerCase() === documented[8453].address && asset.decimals === 6;
}
