/**
 * SDS-local refundClaim from published settlement delivery status.
 *
 * Closed public values: none | unknown | not-offered.
 * This projector never emits payable, refunded, or paid-out.
 *
 * Current pinned agent402 delivery (evidence-records settlements, not a stale
 * "repair_required" token) is:
 *   seller_http_200_repair_required_no_buyer_owned_output_enforcement
 */

export const REFUND_CLAIMS = Object.freeze(["none", "unknown", "not-offered"]);

export function classifyRefundClaim(record) {
  const delivery =
    typeof record?.settlement?.validDeliveryStatus === "string"
      ? record.settlement.validDeliveryStatus
      : "";

  if (delivery.includes("intake_required")) return "not-offered";
  if (delivery.includes("repair_required")) return "not-offered";

  if (record?.sourceKind === "external_work_payout") return "none";

  if (
    record?.sourceKind === "buyer_attested_receipt" &&
    delivery.includes("delivered") &&
    !delivery.includes("repair_required")
  ) {
    return "none";
  }

  return "unknown";
}

export function assertRefundClaim(value) {
  if (!REFUND_CLAIMS.includes(value)) {
    throw new Error(`refundClaim is not in the closed set: ${value}`);
  }
  return value;
}
