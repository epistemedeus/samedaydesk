/**
 * Later integration bindings. This packer does not wait on sibling W4 work.
 * Root owns wiring after merge. Adapters stay injected; no competing kernel.
 */
import { F08_DIR, F08_SHA, I01_HEAD, I01_PR } from "./pins.mjs";

export const LATER_BINDINGS = Object.freeze([
  {
    id: "F08",
    when: "F08 paid wrappers merge to SDS main",
    bind: "Keep consuming receipt schema samedaydesk.paid-useful-jobs.receipt.v1. Optional: point F08_READONLY_WORKTREE or server/paid-useful-jobs at the merged tree for pin checks. Do not import wrapper.mjs or run settle.",
    pin: F08_SHA,
    path: F08_DIR,
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
    bind: "Earned-work termsVersion stays sha256: + 64 hex. This packer refuses integer termsVersion if it appears on an input. Do not cherry-pick original F01 integer keys.",
  },
  {
    id: "W4-siblings",
    when: "other W4 commerce packs publish APIs",
    bind: "Inject adapters through packDossier({ adapters }). Missing siblings must not block this read-only packer.",
  },
]);
