# H142010 public artifact data

Repository `https://github.com/epistemedeus/samedaydesk.git`, branch `codex/h142010-public-artifact-data-20261104`, worktree `/home/ubuntu/ae14-work/h142010`.

Baseline head `e32c3f2ce4391ccba9e7d15a3fda0a65459406fd`, tree `d1bab4c80bd1d3b4ee5d3c18fdaf245498e663ca`. Code head `c6182a9fddc21594a2487a4bb094fc05253fbeb0`, tree `0cacd5363b373b6cf26fe5182418db8216f7f4e4`. This receiving directory is the child of that code head. It is outside the machine closure, so the measured identity stays the candidate identity below.

## Change

`assertArtifactString` in `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` no longer requires `value.length >= 1`. It still requires a string of at most 500 bytes, then the same control, markup, encoding, scheme, email, currency, payment-amount, secret, and private-content fences. `publicationText` still rejects empty summary, attribution, and object keys. Rights, both consents, depth, count, finite numbers, and private-field names are unchanged. The host pin now records publication file `6751b3579faaddac945dc70be17ebfd221e1fab494a625eb7979e88f6295dc6f` (was `cb8f46ea093c92bd8a9311593ea853d0ab652b562b982c696c938fd7b2bb0931`). No schema, backend, wallet, auth, or ledger was added. `SOURCE.json` still records `458c129b2397099200be163ea6b11be61926114f9d6842897607cfcb9a771ba8`, and that constant is not authority.

Code commit files:

- `vendor/hosted-wallet-market/src/accepted-work-publication.mjs`
- `server/foundry/activation/private-control-pin.json`
- `vendor/hosted-wallet-market/test/accepted-work-empty-data.test.mjs`
- `vendor/hosted-wallet-market/test/fixtures/h142010/empty-value-gap.json`
- `vendor/hosted-wallet-market/test/fixtures/h142010/query-key-collision.json`
- `server/scripts/test-h142010-empty-artifact-data.mjs`
- `server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs`

## Before and after

Before, on the e32 module, `proposalFrom` refused the H140 gap solely because its data scalar is `""`. Replacing that scalar with `kept` passed the old fence. The twelve nonempty cases in `query-key-collision.json` were not the failure. After the correction, the same gap and `{holds:""}` pass, a 500-byte string passes, and a 501-byte string is refused.

Empty summary, empty attribution, and an empty object key stay `publication_refused`. A private spec summary stays `private_field_refused`. Private evidence used as the artifact stays `private_evidence_refused`. One matching consent leaves `acceptedWorkVisible` false and the anonymous artifact read `not_found`. Both exact consents publish the same gap, including `case.left[0][1] === ""`, and the public JSON omits the requester id and the private summary. Withdrawal hides it. One later consent stays hidden, and the second consent restores `key-holds-equals`. The twelve-case corpus still publishes only with both consents. Terms digest is unchanged. The mounted financial snapshot is unchanged. Profile money stays `unfunded`, `signerAuthority` false, and `paidWork` false.

The gap and corpus fixtures are the bytes at pilot `0cbe07d3da69e7d1ef4c9e74fa4e7e037f235cd0` paths `overview/research/phase-20261103/retained-contribution-seed/public/empty-value-gap.json` (`3babe26de0771b15b05ae9ec73716c6bbbb09721a3889c2e16aa906e1a365b0f`, 341 bytes) and `public/query-key-collision.json` (`491c4562ab9acdb316983ddddd56fcea9df84ffdc1f5a7a54d6f44ff4a654a2f`, 2872 bytes). The client fixture is neomorphic-io blob `5c784ddbfa05613496ff55a81498efa816bcb056` at `clients/cold-requester-0.3.1.mjs`, present at both `bebfe6cba25c2e5162b45d10ab51df92d478d8b3` and `b79f985e83e829288a675407a4b4124e58a11f3a` (`accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`, 30187 bytes).

## Tests

All three runs used `--test-concurrency=1` and exited 0.

- `node --max-old-space-size=512 --test --test-timeout=60000` on `accepted-work-empty-data.test.mjs` and `accepted-work-publication.test.mjs`: 9 pass, 0 fail, `duration_ms` 399.69477. The empty-data file loads the e32 module with `git show` and shows the old refusal.
- `node --max-old-space-size=512 --test --test-timeout=60000 vendor/hosted-wallet-market/test/accepted-work-closure.test.mjs`: 1 pass, 0 fail, `duration_ms` 518.460301. The mutated pin file was restored.
- `node --max-old-space-size=768 --test --test-timeout=240000 server/scripts/test-h142010-empty-artifact-data.mjs`: 1 pass, 0 fail, `duration_ms` 5946.177094. Disposable `machineHost({acceptedWorkPublic:true})`, local Postgres, and the ordinary 0.3.1 client. No production host was contacted.

`node --max-old-space-size=256 server/scripts/publish-preserved-client.mjs` exited 0: `viteInvoked` false, 352 files, 59951737 bytes, inventory `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5`.

## Package

`server/scripts/h120010-promote.mjs` against `docs/receiving/h142010-public-artifact-data-20261104/release-contract.json`. Baseline identity `9c57f71bb55d1d7b33e7ecc824393a1b55909b2da7f80ad5bd9d6ae8d872ba3d` / `f16b1673219be5e77da9aed677305bf1dbc32c32d13991cc46e95e76f28cf8e0`. Candidate identity `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` / `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255`. The descriptor profile is the baseline pair. Recorded source constant agrees: false.

Payload is only the publication file and the pin. Tests and the client fixture are excluded. No human surface is coupled. Frozen runtime commits stay journey `427f5a08e3b294a8f15fb9d148f7de46ca7cb538` and desk `0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556`, `publicEnabled` false.

Sealed manifest digest `e662767e57efe17f36ad22b6c7cc2819092d7c804509acf58ad21a432dd28e5b` (unsealed bundle command digest was `e2273c47d0909dac3c30a370df09e5f04745311805a53b6795a2ae64084bf2c3`). Disposable detached worktree `/tmp/h142010-baseline` at the baseline commit, progress `/tmp/h142010-progress.json` on the same filesystem and outside that tree. Install, verify, rollback, and verify all exited 0. Install moved `9c57f71b`/`f16b1673` to `2fc7a988`/`b7d8a722`. Rollback restored `9c57f71b`/`f16b1673` and the old `value.length >= 1` predicate. The worktree and progress file were then removed. `compare-human` exited 0 with `byteEqual` true and `preservedInventoryAgrees` true.

`published-descriptor.json` is a byte copy of the existing e32 public descriptor, sha256 `8adcad786f20aaa8fc618c61438acb94eeeccf3b48197f51b08b6c7ddf988d8a`, 2327 bytes. It was not republished and no download binding was added. `successor` wrote `private-successor-descriptor.json`, 2346 bytes, sha256 `d1d84ce883e397c0b8d0dccc5f83a5d1ab9155de684b0bf5ffb46853af45d0c1`, `published` false, `publicationStatus` `private_unreleased`. Linked installation id in the contract is `01a1a393-d361-700b-8b06-822314b811b7`. This writer did not deploy, mutate production config, create a live account, task, consent, or offer, sign, fund, pay, merge a default branch, send a message, or start a timer.

Command stdout and exits are in `commands.json`. Every promoter command below exited 0:

- `bundle --contract <packet>/release-contract.json --repo <worktree> --out <packet>/bundle`
- `seal --contract <packet>/release-contract.json --bundle <packet>/bundle --measured <packet>/measured.json`
- `verify --contract <packet>/release-contract.json --root /tmp/h142010-baseline`
- `compare-human --contract <packet>/release-contract.json --baseline /tmp/h142010-baseline --candidate <worktree> --out <packet>/human-comparison.json`
- `install --contract <packet>/release-contract.json --bundle <packet>/bundle --destination /tmp/h142010-baseline --progress /tmp/h142010-progress.json`
- `verify` again on that destination
- `rollback` with the same bundle, destination, and progress
- `verify` again
- `successor --contract <packet>/release-contract.json --descriptor <packet>/published-descriptor.json --out <packet>/private-successor-descriptor.json`

`<packet>` is `docs/receiving/h142010-public-artifact-data-20261104`. Promoter argv also included `node --max-old-space-size=512 server/scripts/h120010-promote.mjs`.

## Inventory

Paths are under `docs/receiving/h142010-public-artifact-data-20261104/`. Hashes are sha256 of the file bytes.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `bundle/manifest.json` | 2515 | `fd13b787cbc096df7ef5ff078555a47a51867d9f5e4fad5b9138231fdc1dee76` |
| `bundle/partition.json` | 1066 | `6a342dac65538e334d5096ce00aab31b947438e3e44e5df39c4b4cec601f67b0` |
| `bundle/baseline/server/foundry/activation/private-control-pin.json` | 228772 | `fe1b2e8642f0a8c8e6a69def03b7bb24d14595a69b389e14ca62acf62f12c318` |
| `bundle/baseline/vendor/hosted-wallet-market/src/accepted-work-publication.mjs` | 13311 | `cb8f46ea093c92bd8a9311593ea853d0ab652b562b982c696c938fd7b2bb0931` |
| `bundle/candidate/server/foundry/activation/private-control-pin.json` | 228772 | `9bea77e3060a914923df8b4698c9f388d0bc15bf7e749791c54879ac784f9be1` |
| `bundle/candidate/vendor/hosted-wallet-market/src/accepted-work-publication.mjs` | 13395 | `6751b3579faaddac945dc70be17ebfd221e1fab494a625eb7979e88f6295dc6f` |
| `release-contract.json` | 3876 | `42f0400721ea0c9efbfd66deed6c25b196b2a0e5934e1d64e907fdb4931e8293` |
| `measured.json` | 164 | `dc96cbaac8a859e42ee6cc741f79d40ab71fc0307065f1f1d0d40b415dd5c68c` |
| `published-descriptor.json` | 2327 | `8adcad786f20aaa8fc618c61438acb94eeeccf3b48197f51b08b6c7ddf988d8a` |
| `private-successor-descriptor.json` | 2346 | `d1d84ce883e397c0b8d0dccc5f83a5d1ab9155de684b0bf5ffb46853af45d0c1` |
| `human-comparison.json` | 929 | `76a09c929aed85a3beee9058ee460232fa75418cee73b943cb596fe9dd579f7d` |
| `commands.json` | 6318 | `90a8696ca8c888a1bf1baa47b44bce0191c120c2047d5551aaeae48d4bf1a6d1` |
| `RESULT.md` | this file | |

## Next

Root installs this sealed bundle only onto a tree that still measures as `9c57f71bb55d1d7b33e7ecc824393a1b55909b2da7f80ad5bd9d6ae8d872ba3d` / `f16b1673219be5e77da9aed677305bf1dbc32c32d13991cc46e95e76f28cf8e0`, then verifies `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` / `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255`. Publish an acquisition descriptor only after that measurement. The private successor is not that publication. Roll back with the same promoter and progress journal; schema 011 is not dropped with the code, and pin-last is not atomic. H143 owns Neomorphic packaging separately.
