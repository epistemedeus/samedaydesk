# H147010 source-bound CI input

Repository `https://github.com/epistemedeus/samedaydesk.git`, branch `codex/h147010-source-bound-ci-input-20261104`, worktree `/home/ubuntu/ae14-work/h147010`.

Base `3445fa1624e8d2a2cc06556cea45730687aa79d1`. Code head `899c88d715dd3dbcd847a45f4e46bad34b002858`, tree `a754d5c61176834facf6959a795c537d44f65ac6`. This receiving file is the child of that code head. It is outside the machine closure. Measured source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` and host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255` were checked again after the CI files existed.

## Kept failure

GitHub run `41755799394` failed in `runtime-startup` at "Receive the independent acquisition packet". The decoder forwarded the global nonsecret `ROOT10940_CI_PACKET` into the participation test. The strict comparison at `server/scripts/test-root10940-machine-participation.mjs` saw actual source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` and expected `5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2`. That assertion is unchanged. The supplied packet is the Root-received 0.3.0/cafd binding, trust anchor `71e880413d2fa6711494886b7023064dea55814bd89ae0010d19b8597c5dd923`, client `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4` (28081 bytes), descriptor `59bfca8be525503917c546f586b7c8724cc5f90fd29052cce8cfce019185148e`. Its profile host is `1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c`.

The local replay of that exact 43432-byte packet through `decode-root10940-ci-packet.mjs --packet` still exits 1. The participation output contains both full source hashes. The journey stops on the profile comparison.

## Selection

A catalog slot is named `${sourceSha256}-${hostSha256}.json`. A packet is eligible only when its source repository is `epistemedeus/samedaydesk`, its required profile matches the candidate being selected, and its trust-anchor sha256 is the one index row that agrees on client, descriptor, repository, version `0.3.0`, and the anchor's `receiving` object. Receiving must have owner `Root`, `passed > 0`, `failed === 0`, a boolean `qualified`, `installed === false`, `candidateRepository` equal to the packet repository, a 40-hex `candidateCommit`, and `originalWriterUnchanged === true`. The legacy variable is one more candidate. It is not the current packet for a different fingerprint, and nothing in this change writes that variable or rewrites an expected hash.

The committed index has one row, anchor `71e880413d2fa6711494886b7023064dea55814bd89ae0010d19b8597c5dd923`, for source `5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2` / host `1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c`. The proposal for source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` / host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255` has `publicationStatus` `unreceived`, `descriptorCommit` `unreceived`, `received` false, and no `receiving` key. A self-stamped receiving block is not selected unless that same anchor is in the index. Two approved anchors for one fingerprint exit 1. On this tree the workflow selector exits 3: `stale actual 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82 expected 5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2`. The receive step therefore stays red until Root enrolls this candidate, and it does not decode the cafd packet into this source. `runtime-startup.yml` still runs the regression first. Pulse, Neomorphic, and tool files were not edited. Production identity `e32c3f2c` / `9c57f71bb55d1d7b33e7ecc824393a1b55909b2da7f80ad5bd9d6ae8d872ba3d` / `f16b1673219be5e77da9aed677305bf1dbc32c32d13991cc46e95e76f28cf8e0` was not installed or replaced. H146 is not a dependency.

The quote expectation is keyed by source fingerprint. `5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2` keeps `voluntary_task_cannot_be_funded`. `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` expects `qualified_selection_required`, because `requirePaid` runs before the voluntary-task gate. Any other fingerprint fails the string check. The quote status must not be 200. The positive packet reached that refusal and then the unchanged financial snapshot.

## Tests

Disposable local Postgres via `AE14_PG_BIN=/usr/lib/postgresql/16/bin`. No live business call, variable write, secret, deploy, or account mutation.

- `node --test --test-concurrency=1 server/scripts/test-postgres-bin.mjs` exited 0. 7 pass, 0 fail, `duration_ms` 58.783487.
- `node --test --test-concurrency=1 --test-timeout=400000 server/scripts/test-h147010-source-bound-ci-input.mjs` exited 0. 16 pass, 0 fail, `duration_ms` 15016.553009.

The 16 checks are the admitted measurement, the single historical catalog row, missing, tampered, wrong-repository, stale, changed-source, unreceived and fabricated receiving, occupied-slot refusal, two simultaneous slots, the historical 0.3.0 client, approved-packet disagreement, proposal byte match plus enrollment refusal, explicit `--packet` over the legacy variable, the kept profile failure (`duration_ms` 3916.912173), and the positive decode of the unreceived current packet (`duration_ms` 9919.74156). The positive packet is not in the approved index. The same packet is exit 6 from the selector.

Enrollment of `proposed-anchor.json` into the committed catalog and index exited 1 with `index_receiving_required`. The historical packet and `index.json` were unchanged.

## NEXT

Root owns receiving. Add `receiving` to a copy of `proposed-anchor.json` only after an independent replay. Do not copy the cafd `ROOT57152` receipt onto this fingerprint, do not overwrite `server/scripts/fixtures/root10940-approved-ci-packets/5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2-1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c.json`, and do not set `ROOT10940_CI_PACKET`. Then run:

```
node server/scripts/produce-root10940-ci-packet.mjs \
  --anchor docs/receiving/h147010-source-bound-ci-input-20261104/proposed-anchor.json \
  --client vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs \
  --descriptor docs/receiving/h147010-source-bound-ci-input-20261104/proposed-descriptor.json \
  --catalog server/scripts/fixtures/root10940-approved-ci-packets \
  --index server/scripts/fixtures/root10940-approved-ci-packets/index.json
```

That command is also `ENROLLMENT.json` `command`. It refuses until the receipt exists. Proposed anchor sha256 `e01d2a0216540ff8a7dde315b39435b6bf31516758a5ead8cbd1bc1b1d676cc8` (923 bytes). Proposed descriptor sha256 `946fceedf7af5827b49e9e9bf434fefb0186b62d3498f84b48bcc84e1adcca1a` (890 bytes). Client sha256 `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4`.

## Inventory

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `.github/workflows/runtime-startup.yml` | 3061 | `76e80ca912be2be4cf28f4d3339e44800dd1c6c15474b52247b91ab6811d4e70` |
| `server/scripts/decode-root10940-ci-packet.mjs` | 2762 | `0ceb6905edb6af190072be377f1b46439e52a4ffc1723c460ca8d14857f24349` |
| `server/scripts/produce-root10940-ci-packet.mjs` | 8638 | `5180c94da36cd7abaeb0c820b47ba464d5a7b6222bbd9c53096fd1eacfaa1c27` |
| `server/scripts/root10940-ci-packet.mjs` | 8876 | `c872f5a76296c191366dd45137895172496edcb77a06d4027cc135349f3634e4` |
| `server/scripts/select-root10940-ci-packet.mjs` | 7419 | `214c084f688ebb791e9b3b031ccf5134d4092f5cbe5840f6649d84001130e78a` |
| `server/scripts/test-h147010-source-bound-ci-input.mjs` | 26296 | `472b9e247ce53b75c26ffe1cc1d5c530854941a69626ef5206fad8a1402ca2c0` |
| `server/scripts/test-root10940-machine-participation.mjs` | 22107 | `20312321769961bc87effc9846d0b2f083bb2f14f1459f72f4119255ad058a8d` |
| `server/scripts/fixtures/root10940-approved-ci-packets/5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2-1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c.json` | 43432 | `a3fc0037802ad15c17507eda04da42490d4e1ac8470c5305aac0ad3267d28296` |
| `server/scripts/fixtures/root10940-approved-ci-packets/index.json` | 1260 | `924e25f02999167931cf791351e9c189506ad5cfcb3dfae69921997288d15f84` |
| `docs/receiving/h147010-source-bound-ci-input-20261104/ENROLLMENT.json` | 42088 | `dcdf009200a6204ef1fb4799d579b95df88f17bc174a55c351ac359d38dd9221` |
| `docs/receiving/h147010-source-bound-ci-input-20261104/proposed-anchor.json` | 923 | `e01d2a0216540ff8a7dde315b39435b6bf31516758a5ead8cbd1bc1b1d676cc8` |
| `docs/receiving/h147010-source-bound-ci-input-20261104/proposed-descriptor.json` | 890 | `946fceedf7af5827b49e9e9bf434fefb0186b62d3498f84b48bcc84e1adcca1a` |
