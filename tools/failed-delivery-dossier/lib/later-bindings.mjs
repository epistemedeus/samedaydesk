/**
 * Later integration bindings. This packer does not wait on sibling W4 work.
 * Root/W5-D01 owns wrapper wiring after merge. Adapters stay injected; no competing kernel.
 */
import { F08_DIR, F08_SHA, I01_HEAD, I01_PR, SDS52_PR, SDS52_SHA } from "./pins.mjs";

export const LATER_BINDINGS = Object.freeze([
  {
    id: "F08-capture",
    when: "historical fixture provenance",
    bind: "Rejected/unfunded receipt fixtures were captured at F08_SHA. That pin is not SDS52_SHA. Do not force the two hashes equal. Do not import wrapper.mjs or run settle.",
    pin: F08_SHA,
    path: F08_DIR,
  },
  {
    id: "SDS52",
    when: "current wrapper consumption",
    bind: "Tested against SDS PR52 receipt schema samedaydesk.paid-useful-jobs.receipt.v1 at SDS52_SHA via read-only worktree CLI. Remaining binding: W5-D01 may amend the wrapper; this packer keeps consuming the receipt schema only.",
    pin: SDS52_SHA,
    pr: SDS52_PR,
  },
  {
    id: "checkout-verify",
    when: "Root wants live HTTP evidence on a shared SDS process",
    bind: "Reuse lib/capture-checkout-http.mjs against the published /api/checkout/verify route with fixture Stripe keys. Do not call live Stripe.",
  },
  {
    id: "I01",
    owner: I01_PR,
    head: I01_HEAD,
    bind: "Earned-work termsVersion stays sha256: + 64 hex. This packer refuses integer termsVersion if it appears on an input. Do not cherry-pick original F01 integer keys. Golden hash was not re-verified at Neo54 346bbd3c in this slot.",
  },
  {
    id: "live-extract",
    when: "external extract GET is actually captured",
    bind: "Local-runtime HTTP 402 is not live extract. Production extract remains unrun until origin.class is external with a captured status. Do not report expected 402 as observed.",
  },
  {
    id: "W4-siblings",
    when: "other W4 commerce packs publish APIs",
    bind: "Inject adapters through packDossier({ adapters }). Missing siblings must not block this read-only packer.",
  },
]);
