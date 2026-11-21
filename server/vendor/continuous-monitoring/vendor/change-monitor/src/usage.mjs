import { MonitorError } from "./errors.mjs";

export function usageReceipt(state, subscriptionId, now) {
  const subscription = state.subscriptions[subscriptionId];
  if (!subscription) throw new MonitorError("subscription not found", { code: "unknown_subscription" });
  const usage = state.usage[subscriptionId];
  const deliveries = { pending: 0, unknown: 0, accepted: 0, failed: 0 };
  let acknowledgements = 0;
  for (const event of Object.values(state.events)) {
    if (event.subscriptionId !== subscriptionId) continue;
    const delivery = state.deliveries[event.eventId];
    if (delivery && Object.prototype.hasOwnProperty.call(deliveries, delivery.state)) {
      deliveries[delivery.state] += 1;
    }
    if (state.acknowledgements[event.eventId]) acknowledgements += 1;
  }
  return {
    schema: "change-monitor.usage-receipt.v1",
    subscriptionId,
    owner: subscription.owner,
    source: subscription.source,
    revision: subscription.revision,
    status: subscription.status,
    countedAt: now,
    checks: usage.checks,
    unchanged: usage.unchanged,
    baselinesEstablished: usage.baselinesEstablished,
    usefulEvents: usage.usefulEvents,
    contentChanged: usage.contentChanged,
    serviceRestored: usage.serviceRestored,
    evidenceUnavailable: usage.evidenceUnavailable,
    suppressedByBudget: usage.suppressedByBudget,
    admissionsRefused: usage.admissionsRefused,
    deliveries,
    acknowledgements,
    budget: {
      maxUsefulEvents: subscription.budget.maxUsefulEvents,
      remaining: Math.max(0, subscription.budget.maxUsefulEvents - usage.usefulEvents),
    },
    cost: {
      billable: false,
      paidSubscriptionActivated: false,
      unit: "useful-event",
      quantity: usage.usefulEvents,
      unchangedExcluded: true,
      price: null,
      sku: null,
      currency: null,
      note: "Unchanged checks are not useful deliveries. This receipt records scoped usage only. It is not an invoice and does not activate a paid subscription.",
    },
  };
}

export function listConsumable(state, subscriptionId) {
  return Object.values(state.events)
    .filter((event) => event.subscriptionId === subscriptionId)
    .sort((left, right) => left.admittedAt.localeCompare(right.admittedAt) || left.eventId.localeCompare(right.eventId))
    .map((event) => ({
      event,
      delivery: state.deliveries[event.eventId] ?? null,
      acknowledgement: state.acknowledgements[event.eventId] ?? null,
    }));
}
