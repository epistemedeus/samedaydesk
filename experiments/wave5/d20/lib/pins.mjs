import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const HARNESS_DIR = join(here, "..");
export const SDS_ROOT = join(here, "../../../..");

export const MAILBOX_PIN_SHA = "baf09dc591c83aec94e0cf42c5c64076fc5b98e3";
export const MAILBOX_PIN_REF = "codex/w4-commerce-02-20260911";
export const MAILBOX_PR = 58;
export const MAILBOX_OWNED = "tools/result-mailbox/";
export const MAILBOX_CLI_REL = "tools/result-mailbox/bin/mailbox.mjs";

export const OUTBOX_PIN_SHA = "828d8942fb1631aba92a9116dc9fbde0ee1dd258";
export const OUTBOX_PIN_REF = "codex/w4-commerce-09-20260911";
export const OUTBOX_PR = 71;
export const OUTBOX_OWNED = "tools/job-delivery-outbox/";
export const OUTBOX_CLI_REL = "tools/job-delivery-outbox/bin/outbox.mjs";
export const OUTBOX_RECEIVER_REL = "tools/job-delivery-outbox/bin/loopback-receiver.mjs";
export const OUTBOX_PKG_REL = "tools/job-delivery-outbox";

export const F08_PIN_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const F08_PIN_REF = "fable/f08-paid-wrappers";
export const F08_PR = 52;
export const F08_CLI_REL = "server/paid-useful-jobs/bin/cli.mjs";
export const F08_BEFORE_REL = "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json";
export const F08_AFTER_REL = "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json";
export const F08_PAYMENT_REL = "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json";

export const MAILBOX_ENVELOPE_SCHEMA = "samedaydesk.result-mailbox.envelope.v1";
export const MAILBOX_PICKUP_SCHEMA = "samedaydesk.result-mailbox.pickup.v1";
export const MAILBOX_TERMS_SCHEMA = "samedaydesk.result-mailbox.terms.v1";
export const OUTBOX_TERMS_SCHEMA = "samedaydesk.job-delivery-outbox.terms.v1";
export const F08_RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";

export const CLOCK = "2026-09-11T20:00:00Z";
export const EXPIRES = "2026-09-12T20:00:00Z";
export const JOB_ID = "vendor-budget-impact";
export const OUTPUT_JSON = "budget-impact.json";
export const OUTPUT_MD = "budget-impact.md";

export const PG_BIN = process.env.OUTBOX_PG_BIN || "/usr/lib/postgresql/16/bin";
