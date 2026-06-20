import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Memoized Stripe.js loader. Null if no publishable key is configured.
let promise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  if (!key) return Promise.resolve(null);
  return (promise ??= loadStripe(key));
}
