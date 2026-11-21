// One paced read per call. An RPC fault is returned to the caller, never replayed.
const methods = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getLogs"]);

export function createReceiptRpc({ intervalMs = 1000, fetchImpl = fetch } = {}) {
  if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 10000) throw new Error("Invalid receipt RPC interval");
  let next = 0, id = 0;
  return async (endpoint, method, params) => {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !methods.has(method)) throw new Error("Only HTTPS receipt read methods are allowed");
    const wait = Math.max(0, next - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    next = Date.now() + intervalMs;
    const response = await fetchImpl(url, { method: "POST", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    if (!response.ok) throw new Error(`RPC ${method}: HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(`RPC ${method}: code ${body.error.code}`);
    if (body.result == null) throw new Error(`RPC ${method}: no record`);
    return body.result;
  };
}
