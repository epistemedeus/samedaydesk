# AE14 E11 compatibility maintenance

Verdict: `delta`

The finite acceptance template was not already in SameDayDesk. This package is that delta. It does not rebuild recurring-job-recipes, result-reuse, E01, E02, E06, the 228300 finite queue, or the 228200 supplier handback.

## Base and head

| Item | Value |
| --- | --- |
| Repository | https://github.com/epistemedeus/samedaydesk.git |
| Branch | `codex/ae14-e11-compat-maintenance` |
| Base | `d8cea059213e06d2f263be67f82e498f8052a50f` |
| Implementation | `71840cf63454635e5826831080967113b8eb95e2` |
| Writer path | `tools/ae14-compat-maintenance/` |
| Next integration owner | dr eggbot, then Root |

This file is the receipt commit after `71840cf63454635e5826831080967113b8eb95e2`. That parent is the implementation, including the tests and evidence logs. This file does not contain its own commit hash. The exact receipt head is `git rev-parse HEAD` on this branch. Confirm `git rev-parse HEAD^` is the implementation commit.

## What landed

One finite maintenance occurrence, `fixtures/request-repair-accept.json`. The immutable prior keeps sku `CC-4` at `contractVersion` `compat-1`. The current fixture changes only the contract version. `source-change-alert` detects that change. Rights are MIT, not withdrawn, and cleared, so the disposition is repair (`useful_positive`). The retained sku is reused. `paidTaskIncrement` stays 0. A distinct cold profile reads the revoked mandate and does not inherit it. Uncertain prior spend stays `outcome_unknown`. An authorized reviewer accepts the occurrence before expiry.

The acceptance is local. Signature is absent, submitted is false, confirmed usable funding is false, and payment was not sent. The 20-atom quote fee is 1 atom (`floor(20 * 500 / 10000)`). Authorization is not a reservation, submission is not a capture, and canonical settlement is not joined. Rail posts stay 0. Result-reuse can preview the occurrence, and an opt-in export is unverified evidence. Reuse permission stays ungranted.

The same template also records useful no-fit (withdrawn access, missing sku, non-MIT license, inherit-full, rights not cleared), reviewer rejection, not-yet-due when the contract is unchanged, expiry winning over a late accept, operator capture without acceptance, receipt reuse across tasks, and a digest readback that does not post a second effect. HTTP `POST` and the CLI return the same JSON. Transport 200 is not useful work.

No timer, scheduler, queue, subscription, live obligation, or supplier 228200 rerun was added.

## Consumed inputs

| Input | Commit |
| --- | --- |
| SDS base, `tools/recurring-job-recipes/`, `tools/result-reuse/` | `d8cea059213e06d2f263be67f82e498f8052a50f` |
| Portfolio, decisions, execution, candidate receiving | pilot `7428845d6429b78573801ee8035953e26c610eaf` |
| H matrix, not executed | pilot `ecf78d29c2c592dd03b5daef4eeba2f29772c8ae` |
| Cold stage script | pilot `c3436e8647bd111a04359193c55f2c97be77e180`, blob `613e3e336fc315650ea195270c010b1ef75ecf2a` |
| E01 repeat procurement receipt | neomorphic-io `7f458d5156fb308a5586bdba30a2ff7ae01357ab` |
| E02 compat repair receipt | neomorphic-io `338b9dfebf415d00ee0a21773d4d7f848d9ba4d6` |
| E06 task economics receipt | neomorphic-io `75312c3ac1590dbf913ae516b7fb76c9db6e74d9` |
| Finite queue 228300, not copied | x402-url-extractor `b0fe7246211318e0df183a733a62c047bae4b4fb` |
| Supplier 228200, not rerun | neomorphic-io `4133cde2ad11e7c58e5913c95c4134b253ab7bdc` |
| Fee rule only, no contract code | commerce-payments `docs/Fees.md` at `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`, MIT, Copyright (c) 2025 Coinbase |

Detail is in `INVENTORY.md` and `PINS.json`.

## Tests

Commands and outputs are in `evidence/`. Node v22.14.0. npm 10.9.9.

| Suite | Result |
| --- | --- |
| `node --test --test-concurrency=1 tools/ae14-compat-maintenance/test/*.test.mjs` | 28 passed, 0 failed, exit 0 |
| `npm run test:recurring-job-recipes` | 83 passed, 4 failed, 3 skipped, 90 total, exit 1 |
| `node --test tools/result-reuse/test/*.test.mjs` | 25 passed, 0 failed, exit 0 |

The inherited failures are the missing local `x402-merchant` checkout (`expected sibling x402-url-extractor` or `MERCHANT_INPUT_ROOT` absent). The skipped mounted, buyer-setup, and failure-injection cases name the same missing checkout. This branch does not edit those suites.

Tests: 28/28 owned pass; result-reuse 25/25 pass; recurring-job-recipes 83/90 pass, 4 fail, 3 skip, exit 1.

## Limits

H remains `pending-join`. This receipt does not run the lead harness and does not claim Postgres, certificate-verified TLS, a disposable chain, acceptance joined to capture, or encrypted owner-material recovery. Local shapes cover quote/fee at 19/20/21 and `9007199254740993`, acceptance versus expiry, ambiguous readback without a second post, receipt reuse, tenant and authority refusal, legacy 221400 and 234100 left unrepriced, useful repair versus useful no-fit, HTTP/CLI parity, and serving scope (`publicEnabled` false, no production money).

Lowest reliable reward, complete effort, review burden, modeled cost, and cash cost stay unknown. Review burden is not money. A labelled quote is not a measured market price and not customer revenue. 221400 rewards stay 10000 and 50000 atoms with no fee. 234100 stays `0.10` USDC net. Its atomic count is not invented. The 5% fee is not applied to either legacy terms.

Stateless readback compares a caller-held digest. This package does not store a queue, so a lost response without that digest is a new one-shot run rather than a second post. Successful reuse does not increase the paid-task count. No production signer, funds, live offer, payment, deployment, or default-branch merge.
