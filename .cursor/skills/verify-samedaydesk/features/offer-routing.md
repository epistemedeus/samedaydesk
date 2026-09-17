# offer-routing

Map a job description onto an existing SameDayDesk offer. Never invents payment or live hosting.

| field | value |
| --- | --- |
| goal | job → existing offer, no pay |
| entrypoint | `tools/offer-routing/route-job.mjs` |
| command | `pack run offer-routing` |
| state | `selected:null` for complete-issue; `complete_issue_acquisition_unavailable` |
| tests | `npm run test:offer-routing` |
| prerequisite | matrix `tools/offer-routing/capability-limits-matrix.json` |

## Sub-features

- `complete-issue` fixture exits 2, `ok:false`, `selected:null`.
- `matrix` is the only offer catalog; no live SKU mint.

## How to get to it (user POV)

- Operator runs the router on a job JSON they already hold.

## Driving it with verify-cli

Preconditions: none.

- **Mapped refuse.** `node tools/verify/cli.mjs prove --feature offer-routing --json`. Exit 0 after observing product reject (`--expect-product-reject`).
- **Raw pack.** `node tools/verify/cli.mjs pack run offer-routing --json` follows child exit (2 today).

## Gotchas

- Complete-issue acquisition is unavailable on this pin. That is the proof, not a bug to “fix” by paying.
- Do not add a second offer matrix.
