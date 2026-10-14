# Finite compatibility-maintenance acceptance

One operator-supplied compatibility occurrence over the existing
`source-change-alert` recipe and the existing result-reuse projection.
It is an acceptance template, not a scheduler, queue, subscription, or
supplier rerun.

The checked-in occurrence is `fixtures/request-repair-accept.json`: the
retained `CC-4` sku stays usable, `contractVersion` changes, a distinct cold
profile reads a revoked mandate without inheriting it, and an authorized
reviewer accepts the repair locally. The quote gross is 20 atoms. The
per-capture fee is 1. Capture, settlement, and payment stay unjoined.

```sh
node tools/ae14-compat-maintenance/cli.mjs run \
  --request tools/ae14-compat-maintenance/fixtures/request-repair-accept.json
```

Paths inside a request file resolve from this directory. Add `--opt-in --out`
only when writing a result-reuse observation. That observation is unverified
evidence. It does not grant reuse permission and it does not repurchase the
retained sku.

HTTP `POST` on `127.0.0.1` returns the same JSON as the CLI. Transport status
200 is not useful work. The joined H harness is `pending-join`: this package
does not run Postgres, certificate-verified TLS, or a disposable chain.

```sh
node --test tools/ae14-compat-maintenance/test/*.test.mjs
```

Consumed receipts, the finite queue, and the supplier handback are recorded in
`PINS.json`. Supplier 228200 is not rerun. The 228300 finite queue is not copied.
