# H25 PUBLIC OFFLINE 1.4.7 promotion — acceptance

Narrow metadata + archive placement on public `main` `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`. Root reviews and publishes. No production merge, deploy, or payment.

## Approved bytes (copied, not rebuilt)

| Item | Value |
| --- | --- |
| Version | 1.4.7 |
| Input | `/tmp/h25/inputs/useful-jobs-1.4.7.tar.gz` |
| Bytes | **5255824** |
| SHA-256 | **`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`** |
| Public | `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` |
| Kit | `/kit/useful-jobs-1.4.7.tar.gz` |
| Repair/build source | `27f0730604adf236e0f3ad818a30b5f43be6e656` |
| H21 closeout | `44b8ca0f01429b4d21ee38887405bec90ea77461` (87/0; reused, not rerun) |

## Job set honesty

Archive 1.4.7 lists the same ten ids as public 1.4.0.

**H21 newly reviewed five:** `lockfile-pin-delta`, `json-schema-webhook-drift`, `route-table-diff`, `page-change-offline-job`, `vendor-budget-impact`.

**Inherited, not newly reviewed:** `api-upgrade-brief`, `feed-agenda`, `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record`.

Public catalog/outcomes notes follow the 1.4.7 archive. `vendor-budget-impact` copy matches the archive (not a bill calculator).

## Still previous public downloads (byte-identical)

1.0.0, 1.1.0, 1.2.0, 1.3.0, 1.4.0 remain at their existing URLs. Unpublished 1.4.1–1.4.6 are not listed as historical public downloads. Rejected 1.4.5 and 1.4.6 are not published.

## Nonpayment

`purchaseAuthority: false`. `paidHostedClaim: false`. Free local offline only. HA1/HA2/HA3 hosted acquisition is not this job. Homepage prices unchanged.

## Focused tests

```sh
TMPDIR=/tmp/h25/runtime-tmp NODE_OPTIONS=--max-old-space-size=768 \
  flock /tmp/h25/runtime-tmp/test.lock \
  node --test --test-concurrency=1 \
  experiments/codex-window/h25-offline147-promotion/test/*.test.mjs
```
