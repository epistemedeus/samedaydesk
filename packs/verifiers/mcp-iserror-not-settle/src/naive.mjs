import { isPlainObject } from "./classify.mjs";

/**
 * Naive ledger: HTTP 2xx plus a JSON-RPC `result` (no `error`) is settlement.
 * That is the bug this pack exists to reject. MCP tool failures ride in
 * `result.isError: true` on HTTP 200.
 */
export function naiveHttpSettle(httpStatus, rpc) {
  const statusOk = typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 300;
  if (!statusOk) return { settled: false, basis: "http_not_2xx" };
  const msg = Array.isArray(rpc) ? rpc[0] : rpc;
  if (!isPlainObject(msg)) return { settled: false, basis: "no_rpc" };
  if (msg.error != null) return { settled: false, basis: "jsonrpc_error" };
  if (!Object.hasOwn(msg, "result")) return { settled: false, basis: "no_result" };
  const result = isPlainObject(msg.result) ? msg.result : {};
  return {
    settled: true,
    basis: "http_200",
    ignoredIsError: Boolean(result.isError === true || result.isError === "true" || result.isError === 1),
  };
}
