# Consumer evidence refresh (F07 / W2-09)

Re-run a **customer-owned, already-redacted** case against SDS PR50 evidence
packages without copying private case bytes into public outputs.

Engines come from the committed PR50 archive
`client/public/kit/s178-consumer-repeat-kit.tgz` (718948 bytes, sha256
`04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`). They are
not reimplemented here. Completeness / unknown / prohibited-inference language is
reused from `tools/evidence-records/` — this tool does not add a second
evidence vocabulary.

Optional PR51 `vendor-budget-impact` is an input class for **customer
quantities**. This directory does not import F08 paid wrappers.

## Literal user journey (copy-paste, offline)

From this directory, Node >= 22:

```bash
node bin/refresh.mjs \
  --case fixtures/customer-owned-redacted.json \
  --out out/refresh.json
```

From the repository root:

```bash
node tools/consumer-evidence-refresh/bin/refresh.mjs \
  --case tools/consumer-evidence-refresh/fixtures/customer-owned-redacted.json \
  --out /tmp/cer-refresh.json
```

Expect `customer_owned: true`, `privateLeak: false`, a new `bundleId` and
`digest` bound to `caseDigest`. Freshness is `unknown` unless a
`freshness-receipt` job actually observed current/stale. Original case notes
are not copied into the JSON.

A case that still contains an email is rejected:

```bash
node bin/refresh.mjs \
  --case fixtures/invalid/leaky-email.json \
  --out out/should-not-write.json
# exit 1, code private_leak_rejected, no output file
```

`--example` / SAMPLE cannot become `customer_owned: true`.

## Tests

```bash
npm run test:consumer-evidence-refresh
```

Seeded fail-closed:

1. email / token / `Bearer ` in case or output
2. SAMPLE labelled customer-owned
3. writing the case or refresh JSON to a public catalog path
4. changing live SDS prices
5. treating refresh as a paid sale / settlement
