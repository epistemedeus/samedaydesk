# Exact failure taxonomy (from engine source)

Statuses below are from the pinned SHAs, not desired conclusions. Benchmark runs record whatever the engine actually emits.

## Shared honesty

| Claim | Reality |
| --- | --- |
| SAMPLE / `--example` is a customer job | False. Labeled sample. Not a sale. |
| Fixture payment is live settlement | False. SDS52 `sold` always false; `live-settle-out-of-scope`. |
| Engine crash | Record exitCode, stderr. Status `unknown`. Do not infer a useful report. |
| Missing expected-report | Compare result `unknown`. |

## `w4-json-schema-webhook-drift` (`94c7bfdfeaa99f5e70f341504df3051cc7717f91`)

Success `status`: `actionable` | `partial` | `informational` (no-change used paths → informational, not a synonym of “unchanged”).

Refuse codes include: `not-json`, `not-this-job-openapi`, `remote-ref-refused`, `invalid-json-pointer`, `invalid_input` (integer termsVersion), kind mismatch, HTML/YAML.

Unknown used path missing in both documents is **unknown, not deleted**.

## `w4-lockfile-pin-delta` (`e81efc8ab71b1bde88eca743d297149e61bbb6f2`)

Success `status`: `actionable` | `partial` | `informational`.

Refuse: `html-input`, `package-json-only`, `sample-as-customer-delta`, `missing-input-file`, `missing-required-inputs`, `out-dir-collides-with-input`.

Missing integrity → `partial`, still lists known deltas.

## `w4-route-table-diff` (`7387eb677abd442dfab9081cb0ad95451fd2a762`)

Refuse: `homepage_rewrite_refused`, `sample_not_published_route_table`, `pathless_record`, `integer_terms_version_refused`, `external_catalog_refused`.

`changed` is canonical or robots only. Title-only is `titleOnly`.

## `w4-page-change-offline-job` (`91b57334818ecd7940cb854e9864f3b1749d1d1d`)

Verdicts: `changed` | `unchanged` | `reordered`.

Refuse: `live_fetch_url`, `payment_retry`, `quote_as_success`, `sample_as_delivered_watch`. Clock required. No network.

## SDS52 wrapper (`aeef964fa188443078958d9d6d393afae1d542ee`)

Funding: `unfunded` | `reserved-fixture` | `rejected`. `sold` always false.

Refuse: `missing-job`, `unknown-job`, `sample-not-a-sale`, `live-settle-out-of-scope`, `live-sale-not-available`, `reserved-fixture-requires-payment`, `engine-refused`, `internal-error`.

Jobs: `api-upgrade-brief`, `vendor-budget-impact`, `feed-agenda`, `evidence-ci-annotation`, `listing-repair-packet`, `repeat-job-record`.
