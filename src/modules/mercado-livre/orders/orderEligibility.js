function checkEligibility(order) {
  if (!order) return { eligible: false, reason: "ORDER_MISSING" };
  if (order.cancelled) return { eligible: false, reason: "ORDER_CANCELLED" };
  if (order.fraudRisk) return { eligible: false, reason: "FRAUD_RISK_DETECTED" };
  if (!order.packId) return { eligible: false, reason: "PACK_ID_MISSING" };
  if (!order.sellerId) return { eligible: false, reason: "SELLER_ID_MISSING" };
  if (order.paymentStatus !== "approved") return { eligible: false, reason: "PAYMENT_NOT_APPROVED" };
  return { eligible: true, reason: "ELIGIBLE" };
}

module.exports = { checkEligibility };
