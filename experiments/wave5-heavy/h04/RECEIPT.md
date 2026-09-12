# RECEIPT — W5-H04 useful-job benchmark

| Field | Value |
| --- | --- |
| Repo | `epistemedeus/samedaydesk` |
| Branch | `codex/w5-h04-20260911` |
| Owned path | `experiments/wave5-heavy/h04/` only |
| Native model | `grok-4.6-build` |
| Parent session | `03efef00-6fd3-4435-b2d1-1b32a46661b8` |
| Child count chosen | **9** first + **6** M01 replay + **6** accept-pack (**21** native children total) |
| Pilot pin | `95b3f3a47f5b1b69bd237e4c978fc3376221365d` |

## Child session ids

1. `01a092a7-d4c2-7a50-9d2e-22e50b96ee28` — inventory SDS52 + W4 pins
2. `01a092a7-d4c2-7a50-9d2e-22f658709c06` — schema/webhook pairs
3. `01a092a7-d4c2-7a50-9d2e-2301a3063ddd` — lockfile pairs
4. `01a092a7-d4c2-7a50-9d2e-231a8f91bae8` — API route pairs
5. `01a092a7-d4c2-7a50-9d2e-232b8c742e84` — page-fact pairs
6. `01a092a7-d4c2-7a50-9d2e-233b92369d9f` — harness + engine smoke
7. `01a092b3-0d0c-7702-9cbb-e552273db7fc` — offer candidates + evidence bind
8. `01a092b3-0d0c-7702-9cbb-e56b82beb1f8` — extra tests + SDS52 OpenAPI run
9. `01a092b3-0d0c-7702-9cbb-e57ac61fd344` — persist child engine artifacts into `runs/`

### Accept-pack children (this resume)

16. `01a092f3-b423-7d32-b253-4f32948e6961` — schema accept cases
17. `01a092f3-b423-7d32-b253-4f4afca5c375` — route accept cases
18. `01a092f3-b423-7d32-b253-4f5cf2b4c6ad` — page accept cases
19. `01a092f3-b423-7d32-b253-4f664fe4b88c` — unsupported + delivery-negative cases
20. `01a092f3-b423-7d32-b253-4f70b9c56bcc` — buyer paragraphs / first offers
21. `01a092f3-b423-7d32-b253-4f8b63f4fc2b` — generatedAt-only digest helper

Accept-pack `run`: 27 cases, 18 analysis, 9 refused, 0 deliveryFails. `delivery-negative` pass. Tests **29 pass**.

### M01 continuation children (prior resume)

10. `01a092c7-66cf-7532-8e7c-eac8259c2724` — M01 composition CLI inventory
11. `01a092c7-66cf-7532-8e7c-ead0ea041b1d` — raw-byte oracles for 12 examples
12. `01a092c7-66cf-7532-8e7c-eae70c6505cb` — public lockfile integrity/resolved/addition
13. `01a092c7-66cf-7532-8e7c-eaf81f75895f` — public lockfile remove/noise/refuse/large
14. `01a092c7-66cf-7532-8e7c-eb0821da05d2` — non-CVE language correction
15. `01a092c7-66cf-7532-8e7c-eb103907a82c` — CLI/library equivalence

## RAM / disk vs reserve

Host ~16 GiB RAM, ~10 GiB available during 9-child fan-out (~62% free; reserve target ~25%). Disk ~4% used of 254 G (~244 G free; reserve target ~20%). No extra children 10–18: remaining work was integration, RECEIPT, PR.

## Engines actually executed

| Engine | SHA |
| --- | --- |
| SDS52 paid-useful-jobs | `aeef964fa188443078958d9d6d393afae1d542ee` |
| W4 json-schema-webhook-drift | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` |
| W4 lockfile-pin-delta | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` |
| W4 route-table-diff | `7387eb677abd442dfab9081cb0ad95451fd2a762` |
| W4 page-change-offline-job | `91b57334818ecd7940cb854e9864f3b1749d1d1d` |

useful-jobs archive sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2522418 bytes (re-hashed). Worktrees under `/tmp/w5-h04/ro-*` (read-only).

## Tests / coverage

`cd experiments/wave5-heavy/h04 && npm test` → **29 pass, 0 fail**. Accept-pack `run`: 27 cases (18 analysis, 9 refused, 0 deliveryFails). `delivery-negative` pass. M01 replay measurements remain under `runs/measurements/m01-replay.json`.

## Strongest offer candidates

1. **h04-lock-01** — `concurrently`/`qs`/`shell-quote` version+integrity+resolved pin-deltas; operator must not `npm ci` as if pins were unchanged. SDS commit subject is `fix(deps): update vulnerable locked dependencies` (quoted). The commit message claims vulnerable deps; H04 does not join advisories. Not a CVE proof / not a vulnerability scanner.
2. **h04-schema-01** — JSON Schema `exclusiveMinimum` boolean→number; boolean emitters break.
3. **h04-page-03** — `/x402/verified` inspection criterion becomes 7-day CDP Bazaar freshness; same SHAs as a route no-change control.

## Exact failures observed

- Page `--example` refuses `sample_as_delivered_watch` (designed). Journey analog succeeds.
- W4-commerce-11 and W4-commerce-13 GitHub PR numbers: **unknown** (compare URLs only).
- Engine no-change token is `informational` (schema/lock) vs page `unchanged` vs route-diff no `status` key. Harness aliases for compare; strings still differ (`offers/VOCABULARY-GAPS.md`).
- Full SDS lockfile self-diff is `partial` because `vendor/neomorphic-correspondence` lacks integrity; lock-03 uses a 159-pin subset.

## Useful findings + next owner

SDS52 `api-upgrade-brief` on caller OpenAPI (`h04-route-02`) is `actionable`, `sold=false`, `fundingState=unfunded`, +3 used ops (`consider-adoption`). W4 engines produce decision-changing briefs on real public/SDS revision pairs without copying M06–M09 corpora.

**Next owner:** W5-D01 / Root — bind these twelve jobs into the SDS52 supplied-input contract if an offer is published. Do not treat SAMPLE smoke as a sale. Do not merge to production from this receipt.

## M01 composition (continuation)

| Item | Value |
| --- | --- |
| Composition SHA | `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e` (observed `/tmp/w5-h04/ro-m01`) |
| Replay CLI | `node experiments/wave5/m01/bin/run-job.mjs` |
| Library | `runCatalogJob` ≡ `invokeEngine` on domain counts/status; `pin-delta.json` sha256 differs at `generatedAt` only |
| Mapping failure | `h04-route-02` not in M01 four; schema engine probe `not-json` on YAML OpenAPI |
| New lockfile cases | 7 (mocha integrity, mocha resolved http→https, axios add, webpack-cli remove, npm/cli noise, berry yarn.lock refuse, SDS large partial) |
| Language | Version bumps are pin-deltas, not CVEs without advisory join (`offers/LANGUAGE.md`) |
| Lockfile still first offer | Yes. M01 `firstOffer=lockfile-pin-delta`. Replay covers add/remove/integrity/resolved/noise/refuse/large with honest analysis/refuse. Schema/route/page remain later SKUs (used-path only; OpenAPI not this job; page never claims fresh fetch). |

Strongest invocations (cwd `/tmp/w5-h04/ro-m01`):

```bash
node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before <h04-lock-01/before.json> --after <h04-lock-01/after.json> --out-dir "$OUT"
node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before <h04-pub-lock-01/before.json> --after <h04-pub-lock-01/after.json> --out-dir "$OUT"
node experiments/wave5/m01/bin/catalog.mjs contract
```

## Payment-example-match (additive)

Owned: `experiments/wave5-heavy/h04/payment-example-match/`. Accept-pack history above is unchanged. Content commit `89096211c5640495aab95298fa4fb70914317717`.

Question: do the four GET `/extract` paid-success request digests match a publicly advertised demo?

- Framer reproduced from merchant pin `a143898dd1ec35c097ca7eb0b472f30dad1ee319`.
- **Triple digest** `2f7eb0c0…a670` **matches** published target `/extract?url=https%3A%2F%2Fexample.com` (x402 catalog / customer-x402 README). Unencoded `https://example.com` and path-only `/extract` do not match.
- **Fourth digest** `6312daa4…62ad` **unresolved** in the finite public corpus.
- Implication: treat the three identical purchases as sample/benchmark/demo bytes, not organic demand. Improve published supplied-input examples; next first-party measurement is **D17**, not new surveillance.
- Run: `cd experiments/wave5-heavy/h04/payment-example-match && node --test test/*.test.mjs && node replay.mjs`

## Lockfile-buyer-recipe (additive)

Owned: `experiments/wave5-heavy/h04/lockfile-buyer-recipe/`. Accept-pack and `payment-example-match/` are unchanged. Merchant pin `ca38205279f0d543515b81b7261909e55ea2600f`. Content commit `53fa1e82f2ce1cc20f7020e12fc9cf9960c87bbc`.

Unpatched generic POST customer-x402 **refuses** `/lockfile-pin-delta` (`authorization path must be /extract/batch`). Purchase/preflight/reconcile already bind exact body bytes after inspect + `--approve`. Preferred artifact is **both**: recipe on that client + tiny merchant patch (authorization routing + discoverability). Proofs: mounted merchant, fake facilitator, throwaway signer; cases change / no-change / timeout-unknown / replay-negative. No live payment. Optional Hermes AgentSkills drop-in (no native payer).

Run: `cd experiments/wave5-heavy/h04/lockfile-buyer-recipe && npm test` → **9 pass, 0 fail**. Parent `experiments/wave5-heavy/h04` `npm test` remains **29 pass**.

## PR / compare

| Field | Value |
| --- | --- |
| Head | `c0d2e3976fcd257a718b30ee1351757ad6ebe333` (accept-pack summary restore; count=27) |
| Draft PR | `gh pr create` GraphQL **Resource not accessible by integration** (unchanged) |
| Compare | https://github.com/epistemedeus/samedaydesk/compare/main...codex/w5-h04-20260911 |
