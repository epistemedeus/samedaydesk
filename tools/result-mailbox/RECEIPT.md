# RECEIPT — W4-commerce-02 result mailbox

Repo: `epistemedeus/samedaydesk`
Feature branch: `codex/w4-commerce-02-20260911`
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/58
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-02-20260911
Implementation commit: `f8c1ab80b7545c14ea3a2d5d90b0046e0665fd3f`
Base / startingRef: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
Owned path: `tools/result-mailbox/`
Integration owner: Root

## Source heads consumed (read-only)

| Ref | SHA | Use |
| --- | --- | --- |
| SDS main / PR51 useful-jobs | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | catalog.json, archive `useful-jobs-1.0.0.tar.gz` (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`), result-reuse README (contrast only) |
| F08 pin (worktree, not imported) | `bae3e7cd5034b21019fb272a99d88db964b831ee` | receipt/out-dir shape as later binding notes. Origin tip at fetch was `2529f1f8` (ahead of pin). |
| I01 Neo PR54 hasher | `819fa637ecf5e5177c84efc16fcaa18d57017631` | `hashTermsVersion` / `canonical.mjs` vendored under `vendor/i01-funded-task-terms/` |
| cursor/plugins swarm skill | `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d` | Frame / independent ownership / aggregate / test-map. Not a product file. |

Mailbox `termsVersion` (I01 content hash of this module's terms document):
`sha256:4d82eadb8df19ba0a915da7762d30310ec5d66261aa9a4f5006509d5bd652930`

## Commands and counts

```bash
node --test tools/result-mailbox/test/*.test.mjs
```

**PASS** — 8 tests, 0 fail. Node v22.14.0. No extra npm install. Root `package.json` not edited.

Dependencies: Node >= 22; `tar` to extract the committed useful-jobs archive; local filesystem. No wallet, facilitator, API keys, or Postgres.

## One useful caller journey (local-runtime)

Seed a completed `vendor-budget-impact` envelope by spawning PR51 `bin/useful-jobs.mjs` on this module's caller pricing files, pickup by `requestId`. Copied `budget-impact.json` / `.md` bytes and sha256 match the engine out-dir. `pickup.json` records `retrievedAt`. `deliveredToBuyer` is true only for that non-sample retrieved pickup.

## Seeded-failure coverage

| Case | Result |
| --- | --- |
| SAMPLE `--example` envelope + `--delivered` | exit 2, `sample-not-delivered`, `deliveredToBuyer: false` |
| unknown `requestId` | exit 2, `unknown-request` |
| mutated artifact bytes | exit 2, `digest-mismatch` |
| `--clock` after `expiresAt` | exit 2, status `expired`, not delivered |
| integer `termsVersion` | exit 2, `invalid-terms-version` |
| SAMPLE without `--delivered` | `retrieved-sample`, `deliveredToBuyer: false` |

## Honestly untested

- Local HTTP mailbox or real Postgres store (none on this VM; this interface is a directory + CLI).
- Live payment / settlement (explicitly out of scope; non-settling prototype).
- Spawning F08 CLI from its pin (optional, not imported).
- Pickup of the other five useful jobs (catalog outputs are used; journey seeds vendor-budget-impact only).
- External / hosted acceptance.

Fixtures are used for invalid envelopes (integer termsVersion) and SAMPLE `--example`. They are not proof of a hosted server path.

## Next integration owner

Root. Later binding: W4-commerce-01 / F08 may write this envelope schema into a mailbox directory via an adapter. Do not merge F08 modules into this path. Sibling W4 work was absent and did not block.

No deploy, purchase, live payment, account change, or customer messages.
