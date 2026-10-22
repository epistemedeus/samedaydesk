# CW69 result — lockfile-pin-delta discover / describe / invoke

Status: **adapter complete for the one executable path** (`lockfile-pin-delta`).
Not a production READY claim, not a paid execution, not a catalog publication.

Handoff HEAD: `3547e7c19f3e220275ccb59d547495eafa76bcb1`.
Implemented HEAD: `c4cf459df45f54571ab578d92290fb15071859de`.
Integrated runtime pin: `a9aaa0f8a3bb996948e6033f743b62c4e5417882`.
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/141
Base remains `codex/useful-jobs-core-integration-20260912` @ `30345f69`.
1.4.2 was not imported.

## What shipped

Exclusive writes are under
`experiments/codex-window/cw69-machine-offer-discovery-current/`.
M12/M13 remain imported evidence.

```sh
export NODE_OPTIONS=--max-old-space-size=768
cw69=experiments/codex-window/cw69-machine-offer-discovery-current
node "$cw69/bin/offer.mjs" discover --job-id lockfile-pin-delta --out /tmp/cw69-discovery.json
node "$cw69/bin/offer.mjs" describe --discovery /tmp/cw69-discovery.json \
  --before "$cw69/fixtures/before.json" --after "$cw69/fixtures/after.json" \
  --out /tmp/cw69-description.json
node "$cw69/bin/offer.mjs" invoke --description /tmp/cw69-description.json \
  --before "$cw69/fixtures/before.json" --after "$cw69/fixtures/after.json" \
  --out-dir /tmp/cw69-output
node --test --test-concurrency=1 "$cw69"/test/*.test.mjs
```

`discover` is the useful entrypoint. When evidence exists it names a **linked**
chain: hosted POST `/lockfile-pin-delta` (unpaid 402 capture) → local
`lockfile-pin-delta` CLI task. Qualified activation stays **unknown** (no
payment, claim, checkout, or customer contact). Other job ids refuse
`unsupported-job` rather than inventing a chain.

## Identity (kept distinct on purpose)

| Layer | Kind | Value |
| --- | --- | --- |
| Public free archive/catalog | source-capture | useful-jobs **1.4.1** |
| Catalog job pin | source-capture | `fba9d14872bc4c04214e527b9edfb30c2123c9e7` |
| Integrated M01 engine pin | source-capture | `5f0f189fd3e88eabfeca2b95b2da644e58374372` |
| Wrapper archive acquisition | source-capture | useful-jobs **1.0.0** |
| Merchant OpenAPI + MCP exact version | hosted-evidence | **1.23.49** |
| Published route | hosted-evidence | POST only, x402, 5000 atomic USDC, unpaid 402 |
| Local fixture price | unpublished | 0.02, non-live |
| Cost floor / margin | unknown | not measured |

`isLatest` on the MCP capture is a capture-time field, not authority.
Stale **1.23.45** is refused. Illustrative `charged: true` in the 402 example
is not execution.

## Tests

```
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/codex-window/cw69-machine-offer-discovery-current/test/*.test.mjs
```

| Result | Count |
| --- | --- |
| pass | 19 |
| fail | 0 |
| skip | 0 |

Includes the original 4 foundation checks plus adapter/control/HTTP tests.
TAP: [evidence/adapter-tests.tap](evidence/adapter-tests.tap).

Historical M12 six-job assertion is still a source compatibility failure when
run from `experiments/wave5/m12/test/cli-describe-verify.test.mjs`. It was not
rewritten. Not part of the CW69 adapter suite.

Proof invoke (owner-authored synthetic caller inputs, not customers):
[evidence/proof/pin-delta.json](evidence/proof/pin-delta.json) status
`actionable`, one changed dependency `cw69-dependency`,
`purchaseAuthority: false`.

## Live GET observation (not identity)

Documented GET URLs only. No POST, no payment.

| URL | HTTP | Matches frozen capture |
| --- | --- | --- |
| `https://agents.samedaydesk.com/openapi.json` | 200 | yes (`053fa318…`) |
| MCP exact `versions/1.23.49` | 200 | yes (`be7b6a59…`) |
| `https://agents.samedaydesk.com/.well-known/x402` | 200 | **no** (capture `21ab333a…`, live `127d76ee…`) |
| `https://agents.samedaydesk.com/health` | 404 | expected; no body identity |

Hosted-evidence identity remains the frozen capture. Live x402 drift is
recorded in [evidence/live/rebind.json](evidence/live/rebind.json), not silently
imported.

## Unsupported boundaries

- Paid HTTP invoke, GET on the POST-only route, MPP on this route, live settle
- Engine-root override, unknown acquisition, other useful-jobs ids
- Inventory, prices as cost floors, traffic, customers
- CW21 verifier, CW58, CW60–65, merchant engines, H6A observatory
- PostgreSQL 17: toolchain absent → SQL gate **incomplete** (not required here)
- CW59 / CW68: **unknown access** (private clone 404). See
  [CROSS-REPO-RESULT.md](CROSS-REPO-RESULT.md)

## Next integration owner

Same-repo owner if 1.4.2 or later catalogs should be rebound: re-run identity
checks; do not silently import. Merchant x402 live bytes have already drifted
from the frozen capture and need an explicit capture refresh decision.
CW59/CW68 need private GitHub credentials that this Cursor `gh` token does not
have.
