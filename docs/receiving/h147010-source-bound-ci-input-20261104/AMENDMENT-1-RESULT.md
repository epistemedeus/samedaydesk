# H147010 amendment 1

Repository `https://github.com/epistemedeus/samedaydesk.git`, branch `codex/h147010-source-bound-ci-input-20261104`, worktree `/home/ubuntu/ae14-work/h147010`.

Original result `docs/receiving/h147010-source-bound-ci-input-20261104/RESULT.md` stays as history. Its branch head was `d7fdef572110c598b69bfe86ccfc950ab926e6e0`, tree `802f13b49f92d88720123d5816f048fe8b693906`. Original code head `899c88d715dd3dbcd847a45f4e46bad34b002858`, tree `a754d5c61176834facf6959a795c537d44f65ac6`. Amendment code head `49b6a80a699d319cc7512d4cc6e937e36a5a2eb7`, tree `1e1f0a120c9e7bd5e7caedfdd257836d4e5948e6`. This file is the child of that code head.

## Observed failures

On an isolated copy, Root enrolled the current fingerprint beside the unchanged historical slot. Selection and the normal decoder exited 0. The unchanged suite then exited 1 with exactly these four failures:

- `approved catalog keeps only the historical cafd packet`
- `current tree treats the cafd packet as stale and does not rewrite it`
- `historical fingerprint still selects the immutable 0.3.0 client`
- `approved packets for one fingerprint cannot disagree`

Those tests read the mutable approved catalog and required a single historical row. The repair does not delete the controls, accept an arbitrary source, weaken the profile assertion, change `ROOT10940_CI_PACKET`, or suppress the receive step.

## Repair

Historical-only negatives now use a catalog that contains only the cafd packet and its index row. The historical slot is checked by bytes, sha256 `a3fc0037802ad15c17507eda04da42490d4e1ac8470c5305aac0ad3267d28296`, anchor `71e880413d2fa6711494886b7023064dea55814bd89ae0010d19b8597c5dd923`, and the 0.3.0 client. Later rows are allowed when they do not reuse that fingerprint or anchor. No-write checks compare the original bytes. Missing, unreceived, fabricated, tampered, wrong-repository, changed-source, occupied, and disagreement controls remain. A disposable producer enrollment, without `--allow-unreceived`, then selects and decodes the measured source and also an independent third fingerprint. The fixture receipt uses `independentReplay` `h147010-fixture-not-a-receipt`, `qualified` false, and `installed` false. It is not written to the committed index.

`ROOT10940_CI_CATALOG` and `AE14_PG_BIN` come from the caller. The workflow regression step passes both. The receive step still uses `vars.ROOT10940_CI_PACKET` and `set -euo pipefail`. It stays red until Root enrolls the committed index.

## Tests

Disposable local Postgres. No live variable, secret, deploy, account, signer, or payment. Both commands exited 0 with 25 pass, 0 fail, 0 skip. That is 18 source-selection tests plus the 7 `test-postgres-bin.mjs` tests.

Historical-only catalog:

```
AE14_PG_BIN=/usr/lib/postgresql/16/bin \
ROOT10940_CI_CATALOG=server/scripts/fixtures/root10940-approved-ci-packets \
node --test --test-concurrency=1 --test-timeout=400000 \
  server/scripts/test-postgres-bin.mjs \
  server/scripts/test-h147010-source-bound-ci-input.mjs
```

Exit 0. `duration_ms` 24905.819046. Kept historical decode `duration_ms` 3749.182983 (decoder exit 1, both source hashes). Positive unreceived decode `duration_ms` 9591.535163 (decoder exit 0). Disposable enrollment, selector, and decoder `duration_ms` 10151.752958 (producer `received` true, selector exit 0, decoder exit 0).

The second state was a disposable catalog under `/tmp/h147010-two-received`, not the committed index. The ordinary producer enrolled a fixture copy of `proposed-anchor.json` beside the copied historical packet:

```
node server/scripts/produce-root10940-ci-packet.mjs \
  --anchor /tmp/h147010-two-received-anchor.json \
  --client vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs \
  --descriptor docs/receiving/h147010-source-bound-ci-input-20261104/proposed-descriptor.json \
  --catalog /tmp/h147010-two-received \
  --index /tmp/h147010-two-received/index.json
```

Exit 0. `received` true. Slot `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82-b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255.json`. Fixture trust anchor `6efdbc35f2eb3eab6143a49dd8aeecb06d2fae77c13e849df4fab8be4a490683`. Historical packet bytes unchanged. This anchor is a test double, not a production receipt.

Same union with `ROOT10940_CI_CATALOG=/tmp/h147010-two-received` exited 0. `duration_ms` 25067.106915. Kept historical decode `duration_ms` 3725.1936. Positive decode `duration_ms` 9966.422542. Disposable enrollment path `duration_ms` 9952.466398.

After both runs the committed index sha256 was still `924e25f02999167931cf791351e9c189506ad5cfcb3dfae69921997288d15f84`. Proposed anchor `e01d2a0216540ff8a7dde315b39435b6bf31516758a5ead8cbd1bc1b1d676cc8` still has no `receiving` key.

## NEXT

Root owns receiving. Add `receiving` to a copy of `proposed-anchor.json` only after an independent replay. Do not copy the cafd receipt or this fixture receipt onto the new fingerprint, do not overwrite the historical packet, and do not set `ROOT10940_CI_PACKET`. Then run:

```
node server/scripts/produce-root10940-ci-packet.mjs \
  --anchor docs/receiving/h147010-source-bound-ci-input-20261104/proposed-anchor.json \
  --client vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs \
  --descriptor docs/receiving/h147010-source-bound-ci-input-20261104/proposed-descriptor.json \
  --catalog server/scripts/fixtures/root10940-approved-ci-packets \
  --index server/scripts/fixtures/root10940-approved-ci-packets/index.json
```

Until that enrollment, the workflow receive step exits 3 (`stale`). Do not merge this PR and do not update the GitHub variable.

## Inventory

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `.github/workflows/runtime-startup.yml` | 3346 | `bdca042c59e52fd4154438492fa37034ffb1a5cad60ecfabb67bdac64616c8dd` |
| `server/scripts/test-h147010-source-bound-ci-input.mjs` | 42368 | `af1b9c1ae2a5c44c59d46bfd8af1ae8cdd39ffea4fa3d1eeb90fd02ae06a9c6a` |
