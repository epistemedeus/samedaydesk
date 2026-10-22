/**
 * In-memory Stripe PaymentIntents. No network, no secret key, no live/test API.
 * Idempotency keys collapse creates onto one intent — same contract the
 * published engine expects from Stripe.
 */
export function createFixtureStripe({ retrieveFails = false } = {}) {
  const intents = new Map();
  const creates = [];
  const retrieves = [];
  let createSeq = 0;

  return {
    creates,
    retrieves,
    intents,
    networkCalls: 0,
    liveHosts: [],
    setRetrieveFails(value) {
      retrieveFails = Boolean(value);
    },
    paymentIntents: {
      create: async (params, options = {}) => {
        creates.push({ params, options });
        const key = options.idempotencyKey;
        if (!key) {
          const err = new Error("idempotencyKey required");
          err.code = "IDEMPOTENCY_KEY_REQUIRED";
          throw err;
        }
        for (const intent of intents.values()) {
          if (intent._idempotencyKey === key) return intent;
        }
        createSeq += 1;
        const intent = {
          id: `pi_fixture_${createSeq}`,
          client_secret: `fixture_secret_${createSeq}`,
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata,
          receipt_email: params.receipt_email || null,
          status: "requires_payment_method",
          _idempotencyKey: key,
        };
        intents.set(intent.id, intent);
        return intent;
      },
      retrieve: async (id) => {
        retrieves.push(id);
        if (retrieveFails) {
          throw new Error("fixture retrieve timeout");
        }
        const intent = intents.get(id);
        if (!intent) {
          const err = new Error("No such payment_intent");
          err.statusCode = 404;
          throw err;
        }
        return intent;
      },
    },
  };
}

export function createMemoryFulfillDb() {
  const orders = new Map();
  const profiles = new Map();
  return {
    orders,
    profiles,
    from(table) {
      if (table === "drafts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        };
      }
      if (table === "orders") {
        return {
          select() {
            return {
              eq: (_column, pi) => ({
                single: async () => ({
                  data: [...orders.values()].find((row) => row.stripe_payment_intent === pi),
                  error: null,
                }),
              }),
            };
          },
          upsert(row, { onConflict, ignoreDuplicates } = {}) {
            if (onConflict !== "stripe_payment_intent" || ignoreDuplicates !== true) {
              throw new Error("fulfill must upsert on stripe_payment_intent ignoreDuplicates");
            }
            const existed = [...orders.values()].some(
              (existing) => existing.stripe_payment_intent === row.stripe_payment_intent,
            );
            if (!existed) orders.set(row.id, { ...row });
            const inserted = existed ? [] : [{ id: row.id }];
            return {
              select: async () => ({ data: inserted, error: null }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          update(patch) {
            return {
              eq: async (_col, id) => {
                profiles.set(id, { ...(profiles.get(id) || {}), ...patch });
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}
