# Job contracts and buyer-owned rerunnable acceptance

These modules reuse the existing request-contract kernels. They do not introduce a new protocol, change a product release, or authorize a payment.

## Normal consumer

A maintainer or operator of a paid API or current release who must decide whether to ship, retry, reconcile, or repair one exact route, and who can rerun the returned check on the next release. Source prototypes here use clearly labeled synthetic fixtures. They are not live merchant traffic, a buyer, or a payment.

## Cold caller, recovered failure, and later beneficiary

A cold caller can now complete the free exact-request page-change job discovered from the live merchant MCP tools/list recovery hint or the browser-callable A2A catalog, then bind that request to a job contract and obtain a buyer-owned rerunnable acceptance artifact.

It recovers a wrong-tool refusal on that free path, and it recovers a lost reply after a first committed effect by returning the original result with no second effect; an uncommitted first request is not turned into a fabricated result.

A later maintainer or operator of the same exact route benefits from the rerunnable acceptance artifact by replaying it against a later release to decide whether to ship, retry, reconcile, or repair.

Source prototypes use clearly labeled synthetic fixtures and do not claim an outside buyer.

## Records and projections

This package does not keep a local history that duplicates an authoritative task, terms, acceptance, or result store. The job contract is keyed by the exact request digest. The in-process effect map and the saved acceptance artifact are projections of the first committed evaluation against that record, used only for lost-reply recovery and later rerun. Task identity and terms stay with their owning stores when those records exist; Agent Entry and Work Exchange own that shared contract. This branch was not assigned a shared store at admission, so synthetic fixtures carry task and terms only as input to the projection.

## How to rerun

From a checkout of this branch, no extra install is required:

```sh
cd tools/payment-rail/job-contract
node --test job-contract.test.mjs
```

`npm test` in this directory runs the same command. To replay a saved artifact in your own script, load the job contract and call `rerunAcceptance({ contract, artifact })` from `acceptance.mjs`. Idempotency is keyed by the exact request digest. A lost reply after a first committed effect returns the original result with no second effect. An uncommitted first request does not fabricate a result.

## Acquisition path

The normal consumer reaches this job contract through the already live free merchant path, not a new listing or a paid route. Discover the free page-change tool from the live MCP `tools/list` recovery hint after a wrong-tool refusal, or from the browser-callable Agent-to-Agent catalog, as received for merchant `e90676f48da875c5e0f475f57f7774de947b75a7` in `overview/research/phase-20261101/glama-current-acquisition/LIVE-RECOVERY-20261109.md`. Complete that free exact-request job with the published fixture, including a valid comparison, an incomplete result, and recovery. Then bind a job contract to that exact request digest and rerun the buyer-owned acceptance artifact from this package. That follows the SameDayDesk pattern where funnel evidence is constructed from MCP discovery alone (`overview/research/phase-20261111/funnel-discovery/ROOT-RECEIVING.md`) and the documentation release check that is meant to stay runnable in the maintainer's own release (`epistemedeus/x402-data-gateway-skills` `9ff00fc908a2f8d376f259ca94f0473d40ef7e99`). Paid Machine Payments Protocol stays off. This path does not claim an outside buyer or a new payment.

## What would change direction

If the official remote test run, or a later maintainer rerun of the saved artifact against a changed release of the same exact page-change route, fails to reject a known case already in this suite (missing or wrong required evidence, typed output or charge alone, or a result that does not match the expected result), stop adding contract surface and repair the acceptance runner so those cases fail closed again. Discovered free MCP or A2A calls that complete the page-change job without producing or rerunning an acceptance artifact are not a reason to add a listing or a paid offer. The live recovery record already treats a completed comparison as execution, not usefulness or a buyer.

## Exact input refs

Operating pin (inputs remain here): `epistemedeus/pilot` `dd05d530ab58faa70c80da9f6edfbea6f1d2b44b` on `codex/ae18-sol-launch-20261015`. Current published context at authoring of these sections: `962ac8cda11d43b7c2c26e06da6d2b4044b20dd1`.

Useful Commerce-relevant answers in `overview/self-evaluations/2026-11-12-participant-economy/ROOT-INDEPENDENT-ANSWERS.md` at that context (`## Simplify while preserving assets`) require each branch to name the cold-caller completion, recovered failure, and later beneficiary, and to project authoritative task, terms, acceptance, and result records rather than keep a parallel history.

Reused kernels, all at that pin:

- `tools/payment-rail/buyer/request-contract.mjs`
- `tools/payment-rail/buyer/output-schema-contract.mjs` (inspection pattern only; this package does not take on its CLI or payment dependencies)
- `tools/payment-rail/buyer/response-contract-evidence.mjs` (required-evidence pattern; no new evidence protocol)
- `tools/payment-rail/buyer/paid-resource.mjs` (exact route and bound-quote pattern; this package does not import its settlement stack)

Modeled synthetic fixture, not a product change:

- `epistemedeus/x402-url-extractor` `e90676f48da875c5e0f475f57f7774de947b75a7` (PR #271, `codex/page-change-mcp-recovery-20261109`), including the free page-change recovery check and the unsigned 0.005 USDC Base extract quote as a binding example

Other current release pins consumed as references, not mutated:

- SameDayDesk `epistemedeus/samedaydesk` `32437117e5232480b18349721069b2a8a0fc2a2c` (PR #394)
- Neomorphic `epistemedeus/neomorphic-io` `3232f2891e7af5df3c2a350c764bfdc9d35b1f12` (PR #460)
- EIN v0.1.6 `epistemedeus/ein-llc-lean` `62ac1591c05aa818144a63d95bc1791da000ea00` (PR #210)
- Documentation release check `epistemedeus/x402-data-gateway-skills` `9ff00fc908a2f8d376f259ca94f0473d40ef7e99` (PR #30, `consumers/documentation-release-check/`)
- Commercial anchor and paid-API release-acceptance corpus at the pin: `overview/self-evaluations/2026-11-08-repeatable-delivery/REVENUE-ANCHOR.md` and `overview/research/phase-20261108/paid-api-release-acceptance/`
