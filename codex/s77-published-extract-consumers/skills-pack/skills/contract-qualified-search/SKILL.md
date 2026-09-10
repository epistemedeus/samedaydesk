---
name: contract-qualified-search
description: Find paid Agent402 or MPP machine services that match a capability intent and formally guarantee buyer-required JSON output paths, or audit one already-known seller route for the same guarantee. Use when an agent needs to search for a machine-paid API by the data it must return, reject underconstrained seller schemas before payment, distinguish machine-buyable GET routes from contract-ready POST routes, or create a verified non-spending purchase intent for SameDayDesk's contract-qualified search or seller-integrity audit.
---

# Search contract-qualified machine services

Use SameDayDesk's live machine-commerce origin:

`https://agents.samedaydesk.com`

Choose one workflow:

- Use `/commerce/contract-qualified-search` when the seller or exact route is
  unknown. It searches Agent402 and the official MPP catalog by capability
  intent plus buyer-required response paths.
- Use `/commerce/seller-integrity-audit` when the seller origin, exact route,
  and method are already known.
- Use `/commerce/payment-offer-preflight` when one exact callable GET URL is
  already known and only its current unpaid x402 or MPP terms need inspection.

Read the selected operation from
`https://agents.samedaydesk.com/openapi.json` before constructing the request.
Treat the exact unpaid HTTP 402 challenge as authoritative for price, request
binding, Base network, canonical USDC asset, and recipient.

## Freeze the output need

Write one brand-blind capability intent based on the downstream decision, not a
seller name. Define one to sixteen dotted JSON paths that the seller's success
schema must require recursively. Examples:

- `data.sourceRepository`
- `data.attributes.status`
- `result.transaction.to`

Required paths are machine-verifiable output commitments. Descriptions,
examples, root `object` declarations, optional properties, and lexical search
matches do not satisfy them.

## Preflight contract-qualified search

Construct a complete GET request with:

- `query`: 10 to 300 characters, with no credential or private value;
- `requiredPaths`: comma-separated dotted paths;
- `maxPriceDisplayUnits`: optional, greater than zero and at most ten;
- `limit`: optional integer from one through eight.

Send `X-SameDayDesk-Agent-Source: agent-skills-v1` only on the initial unpaid
request when declared attribution is useful. It is not authentication and
cannot change price or access.

On HTTP 402:

1. require the complete challenged resource URL to equal the request;
2. require Base `eip155:8453` and canonical Base USDC;
3. check the live amount and recipient against caller policy;
4. select exactly one compatible protocol, x402 v2 or native MPP `evm/charge`;
5. freeze the query digest expectation, required paths, cap, limit, operation,
   exact URL, protocol, amount, network, asset, recipient, and expiry;
6. return a purchase intent with `credentialsUsed: false`,
   `paymentSigned: false`, and `paymentSent: false`;
7. stop before wallet access or a paid replay.

A separate payment executor with explicit authority may consume the intent.
Do not fall back to another route after credential creation.

## Validate paid output

After a separately authorized executor returns the paid response and receipt,
require:

- `product` equals `samedaydesk-contract-qualified-search`;
- the returned request contains the frozen required paths, cap, and limit;
- the returned query digest equals the locally computed SHA-256 digest;
- `qualified` and `rejected` stay within the requested limit;
- every qualified item preserves source, origin, method, route, price,
  decision, protocols, runtime status, and guaranteed paths;
- every buyer-required path appears in each qualified item's guaranteed paths;
- the boundary reports no target credential, wallet access, target payment,
  seller POST, or paid target-body read.

Interpret decisions precisely:

- `machine_buyable`: a GET seller route passed its declaration and live unpaid
  runtime checks. It is a candidate for a new, separately authorized purchase.
- `contract_ready`: a POST seller route passed static contract analysis, but no
  seller POST or runtime delivery was verified.
- `no_qualified_candidate`: the bounded search ran successfully and found no
  seller whose current contract met the frozen need. Preserve rejection codes
  and stop instead of weakening the requirement or buying a lexical match.

Never treat catalog presence, a seller declaration, or a search result as
proof of runtime output, settlement, usefulness, trust, or future availability.
Before buying a returned candidate, create a new exact purchase intent and run
the ordinary payment-offer, authorization, output-validation, receipt, and
reconciliation gates.

## Audit one known seller

For `/commerce/seller-integrity-audit`, provide the public HTTPS origin, exact
GET or POST route, method, required paths, and optional strict Bazaar flag.
Reject route templates, query-bearing routes, credentials, and non-public
origins. POST mode is static-safe and must send no seller request. Preserve the
audit's repair plan as advisory seller evidence: it mutates no schema and
infers no property type or business meaning.
