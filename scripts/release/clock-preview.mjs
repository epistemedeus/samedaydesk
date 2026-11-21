// A real Stripe test customer must be created on a clock before Checkout opens.
// This test entry uses the unchanged app and Care service; only the Stripe
// Checkout customer is supplied by the fixture. Production never imports it.
import Stripe from "stripe";
import { createSdsApp } from "../../server/app.js";
import { createCareService } from "../../server/lib/care-service.js";
import { openCareStore } from "../../server/lib/care-store.js";

const env = process.env;
if (env.SDS_PRIVATE_PREVIEW !== "1" || !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "") ||
    !/^cus_[A-Za-z0-9]+$/.test(env.RELEASE_CLOCK_CUSTOMER || "") || !env.RELEASE_RUN) {
  throw new Error("The clock fixture requires an isolated, named Stripe test run");
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-11-18.endive", maxNetworkRetries: 0 });
const customer = await stripe.customers.retrieve(env.RELEASE_CLOCK_CUSTOMER);
if (customer.livemode !== false || !customer.test_clock || customer.metadata.release_run !== env.RELEASE_RUN) {
  throw new Error("Clock customer does not belong to this test run");
}
const create = stripe.checkout.sessions.create.bind(stripe.checkout.sessions);
stripe.checkout.sessions.create = (args, options) => create({ ...args, customer: customer.id }, options);
const care = createCareService({ store: openCareStore(), stripe, secret: env.SDS_CARE_ACCESS_SECRET,
  origin: env.SDS_CARE_ORIGIN, live: false, portalConfiguration: env.SDS_CARE_PORTAL_CONFIGURATION,
  releaseRun: env.RELEASE_RUN });
const server = createSdsApp({ care }).listen(Number(env.PORT), "127.0.0.1");
process.on("SIGTERM", () => server.close(async () => { await care.close(); process.exit(0); }));
