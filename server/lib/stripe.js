// Stripe server client. Null until configured so the app boots without keys.
// apiVersion is left to the SDK default (matches the installed stripe@22 release);
// pin explicitly once verified against the live API.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (key && process.env.SDS_PRIVATE_PREVIEW === "1" && !/^(sk|rk)_test_/.test(key)) {
  throw new Error("Private preview requires a Stripe test-mode key");
}
export const stripe = key ? new Stripe(key) : null;
export const isStripeConfigured = () => stripe !== null;
