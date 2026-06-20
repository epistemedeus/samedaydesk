// Stripe server client. Null until configured so the app boots without keys.
// apiVersion is left to the SDK default (matches the installed stripe@22 release);
// pin explicitly once verified against the live API.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
export const stripe = key ? new Stripe(key) : null;
export const isStripeConfigured = () => stripe !== null;
