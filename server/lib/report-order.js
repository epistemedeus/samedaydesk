import { isValidSellerRepairFindingId } from "./seller-repair-checkout.js";

const reportApi = "https://api.neomorphic.io/v1/desk/report-orders";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const reportCheckoutEnabled = env => env.SDS_REPORT_ORDER_USDC === "1";

function reportEndpoint(env) {
  if (env.SDS_PRIVATE_PREVIEW === "1") {
    const local = new URL(env.SDS_TEST_REPORT_ORDER_ENDPOINT);
    if (local.protocol !== "http:" || local.hostname !== "127.0.0.1" || local.pathname !== "/v1/desk/report-orders" ||
        local.username || local.password || local.search || local.hash) throw Error("isolated preview report owner required");
    return local.href;
  }
  return reportApi;
}

export async function readReportCheckout(order, { env = process.env, fetcher = fetch } = {}) {
  if (!uuid.test(order)) return { status: 400, body: { error: "Check the report order reference." } };
  const response = await fetcher(reportEndpoint(env) + "/status", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json" }, body: JSON.stringify({ order, brand: "sds" }),
  });
  if (!response.ok) throw Error("Report status unavailable");
  const envelope = await response.json(), result = envelope?.result;
  if (envelope?.ok !== true || typeof result?.state !== "string" || typeof result.canOrderAgain !== "boolean") {
    throw Error("Report status unavailable");
  }
  const body = { state: result.state, canOrderAgain: result.canOrderAgain };
  const prefix = "https://agents.samedaydesk.com/order-payments/neo/";
  if (typeof result.wallet === "string" && result.wallet.startsWith(prefix) && result.wallet.endsWith("/wallet") &&
      uuid.test(result.wallet.slice(prefix.length, -7))) body.wallet = result.wallet;
  return { status: 200, body };
}

export async function startReportCheckout(input, { env = process.env, fetcher = fetch } = {}) {
  const preview = env.SDS_PRIVATE_PREVIEW === "1";
  const endpoint = reportEndpoint(env);
  if (!uuid.test(input?.order) || !["card", "base_usdc"].includes(input.method) ||
      (input.finding && !isValidSellerRepairFindingId(input.finding))) return { status: 400, body: { error: "Check the report order details." } };
  const fields = { order: input.order, method: input.method, brand: "sds", finding: input.finding || null };
  if (input.method === "base_usdc") Object.assign(fields,{ publicOrigin: input.publicOrigin, getRoute: input.getRoute,
    authorized: input.authorized === true, email: input.email });
  const response = await fetcher(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),
    headers:{"content-type":"application/json"},body:JSON.stringify(fields)});
  if (!response.ok) return { status: [400,409,422].includes(response.status) ? response.status : 503,
    body: { error: response.status===409 ? "Check the payment already selected for this order." : "The report checkout could not accept these details." } };
  const data = await response.json(), result = data?.result;
  if (data.ok !== true || !uuid.test(result?.order)) throw Error("report order not confirmed");
  if (input.method === "base_usdc") {
    if (result.paymentUrl !== "https://agents.samedaydesk.com/order-payments/neo/" + result.order) throw Error("report order resource differs");
    return { status:201,body:{order:result.order,paymentUrl:result.paymentUrl} };
  }
  const url = new URL(result.url);
  if (url.origin !== "https://buy.stripe.com" || url.username || url.password || url.hash ||
      url.pathname.startsWith("/test_") !== preview || [...url.searchParams].length !== 1 ||
      url.searchParams.get("client_reference_id") !== "report_" + result.order) throw Error("report checkout URL differs");
  return { status:201, body:{order:result.order,url:url.href} };
}

export const reportCheckoutPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/checkout/payment.css"><title>Pay for your one-route report | SameDayDesk</title></head><body><main><h1>One-route report</h1>
<p>490 USD for a written report on one public GET route.</p>
<button id="card" type="button">Pay by card</button>
<details><summary>Pay with USDC on Base</summary><form id="wallet">
<p><label>Receipt email <input name="email" type="email" required maxlength="254"></label></p>
<p><label>Public origin <input name="publicOrigin" type="url" placeholder="https://example.com" required></label></p>
<p><label>GET route <input name="getRoute" placeholder="/api/example" required maxlength="255"></label></p>
<p><label><input name="authorized" type="checkbox" required> I authorize review of this public route.</label></p>
<button type="submit">Pay 490 USDC</button></form></details>
<p role="status" id="state"></p><a id="previous" hidden>View your order</a> <button id="again" type="button" hidden>Start another order</button><noscript><a href="?card=1">Continue to card checkout</a></noscript>
<script type="module" src="/checkout/report-order.js"></script></main></body></html>`;
