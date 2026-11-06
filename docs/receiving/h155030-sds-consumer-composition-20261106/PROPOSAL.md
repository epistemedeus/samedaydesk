# H155030 current source proposal

Unreceived. This is not an approved catalog row, not `ROOT10940_CI_PACKET`, and not a release.

Measured on the composed tree. The recorded base is admitted machine source `335a5e363bcb1798cd8d25f74324a8a4bfb5bed4`.

- repository `epistemedeus/samedaydesk`
- source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`
- host `7a8cc6b0c2e55dffda9dcbc4664c39e2e9042de4de0d2f658d2be0196d48de23`
- anchor `proposed-anchor.json`, 926 bytes, sha256 `077de710edd9dcd1d126d5f5c179484dc2e22eab4ec8b4c4c331879156cf28e2`
- descriptor `proposed-descriptor.json`, 890 bytes, sha256 `e85960134d2387cd67e1de18f6a739fc48e74afd41ad0901a928bd8a779b1cc6`
- enrollment `ENROLLMENT.json`, 43020 bytes, sha256 `78fe2e42ddb0ca6c7bfc758a8e63d1a33ae5b9b976a67fd689c5215b8510207c`
- client `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4`, 28081 bytes, version 0.3.0

The host moved because `package.json` is a private-control pin member and the composed `test:result-reuse` script differs from enrolled host `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`. That enrolled slot, the H142 slot, and the cafd slot stay unchanged. This proposal does not copy their receiving. `qualified` and `installed` stay false. Money stays `unfunded`.

Normal command. It refuses until Root adds `receiving` on a copy of this anchor after an independent replay:

```
node server/scripts/produce-root10940-ci-packet.mjs \
  --anchor docs/receiving/h155030-sds-consumer-composition-20261106/proposed-anchor.json \
  --client vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs \
  --descriptor docs/receiving/h155030-sds-consumer-composition-20261106/proposed-descriptor.json \
  --catalog server/scripts/fixtures/root10940-approved-ci-packets \
  --index server/scripts/fixtures/root10940-approved-ci-packets/index.json
```

Until that enrollment, the runtime-startup receive step exits 3 (`stale`). Do not set the GitHub variable from this proposal.
