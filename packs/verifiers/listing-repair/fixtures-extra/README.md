# fixtures-extra (W0-X76)

Extra packet(+source) corpus for the SDS listing-repair verifier oracle from
R14-01 (`bot/r14-01-listing-repair`). Write boundary is **this tree only**.

Sibling verifier (do not rewrite):

- CLI: `../bin/listing-repair-verifier.mjs`
- Library: `../src/`
- Original fixtures: `../fixtures/` (R14-01)

## Run corpus

```sh
cd packs/verifiers/listing-repair
node fixtures-extra/run-corpus.mjs
# or:
node --test fixtures-extra/corpus.test.mjs
```

Each case is listed in `MANIFEST.json` with `expectedExit` `0` (ok) or `1` (reject).
Cases that set `publish: true` or `purchaseAuthority: true` are **reject-only** —
the corpus never accepts them as ok.

## Seeded failure

```sh
node ../bin/listing-repair-verifier.mjs verify \
  --packet fixtures-extra/reject/publish-attempt.packet.json \
  --source fixtures-extra/ok/base.source.json
# exit 1
```
