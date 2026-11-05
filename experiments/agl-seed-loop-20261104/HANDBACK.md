# HANDBACK

Branch: `codex/agl-seed-loop-20261104`

Base: `49e6b281f96e876f54bd52836bf0aa5a3d24f357` on `codex/n4-contrib-readiness-20261104`

Implementation commit: `34e8301c7fa009966fc2ddb5d7aca81e0e64dd14`

Implementation tree: `8a0312b01ad9378c0fcc0861168c1465f071334b`

This file is the commit after that implementation commit. The terminal records the branch head.

## Producer paths

- `vendor/hosted-wallet-market/src/query-key-consumer.mjs`
- `vendor/hosted-wallet-market/src/accepted-work-publication.mjs`
- `server/lib/apex-declarations.js`
- `server/lib/apex-agent-card.js`
- `server/app.js`
- `client/public/llms.txt`
- `client/src/data/machineEntry.mjs`

`server/foundry/activation/private-control-pin.json` records the new bytes of `server/app.js` (`5376c67e2f90d4ac210351979436862fe8f7d09c564b03ebc91a7a680cc3ec00`) and `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` (`6dfc0957fc21315b2e6d6a13b47dd2e33a086e84de1f773100c5ed4fb80a274d`). No other pin entry changed. The disposable host admits those two files.

The consumer object is rendered by the existing producers. It is not a new HTTP catalog. It is attached to an accepted-work list, detail, or artifact view only when `publicArtifact.schema` is `cc0.query-key-caller.v4`. The artifact body itself stays free of the archive URL and the archive sha256.

No pulse counter was incremented. No new outcome class was added.

## Experiment paths

- `experiments/agl-seed-loop-20261104/README.md`
- `experiments/agl-seed-loop-20261104/HANDBACK.md`
- `experiments/agl-seed-loop-20261104/cold-caller.mjs`
- `experiments/agl-seed-loop-20261104/digest.mjs`
- `experiments/agl-seed-loop-20261104/discovery.mjs`
- `experiments/agl-seed-loop-20261104/host-return.mjs`
- `experiments/agl-seed-loop-20261104/screen.mjs`
- `experiments/agl-seed-loop-20261104/seed-check.mjs`
- `experiments/agl-seed-loop-20261104/seed-return.mjs`
- `experiments/agl-seed-loop-20261104/test/seed-loop.test.mjs`
- `experiments/agl-seed-loop-20261104/test/fixtures/`
- `experiments/agl-seed-loop-20261104/fixtures/`

## Commands

| Command | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| `node --test --test-concurrency=1 experiments/agl-seed-loop-20261104/test/seed-loop.test.mjs` | 0 | 10 | 0 | 0 |
| `npm run test:result-reuse` | 0 | 37 | 0 | 0 |
| `node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs` | 0 | 4 | 0 | 0 |
| `node --test experiments/agl-contribution-delegation-20261104/test/handback-row-decision.test.mjs` | 0 | 1 | 0 | 0 |
| `node --test --test-concurrency=1 server/scripts/test-h133010-accepted-work.mjs` | 0 | 2 | 0 | 0 |
| `node --test --test-concurrency=1 docs/receiving/n4-contrib-readiness-20261104/seed.test.mjs` | 0 | 2 | 0 | 0 |
| `node --test vendor/hosted-wallet-market/test/accepted-work-publication.test.mjs` | 0 | 6 | 0 | 0 |

Served artifact body: 1305 bytes, sha256 `e737cbfd5cb68175721b8c219e6a7c5b4368cfec9cdd2377f706955a49a826ea`. Extracted object: 304 bytes, sha256 `32000ca78bd47d8cd304cfee506389037a96d8d1de5bd5d34d3a7bab4beb54ad`. Foundation digest `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`. The local digest copy matches. The prepublication caller file is 304 bytes and is not byte-equal.

Archive no-checkout stdout fixture: 1247 bytes, sha256 `87d81f0eec2b34ed2a709c7f9e08d08317ae2f8842d72c305a0ee21c68665b9c`. `executed` false. Wires `lot%23=row%203&seal` and `lot%23=row%203&seal=`.

A URLSearchParams-style key returns `equal`. A key that keeps a bare name distinct returns `distinct`. `specExpectation` is `distinct`. Citation: `https://github.com/holistis/agent-receipt-verify/blob/dd0dd2a878b11e8a938f405a4fb3fd2f4e9c00b0/vectors/attempt-identity/known-answer-query-bare-name-stays-bare.json`, content sha256 `ee120c2520d6797acba145ef3ae078f969dd4be8fe68b0ed825c826997dfe201`.

`seed-check` ran in a separate process with `vendor/hosted-wallet-market` and `server` bind-mounted empty and with `execute.py` unavailable. The trace did not contain those paths. Verdict `equal`, digest matched.

Visitor return digest `5cb8f9746e4f516b342d0e93520c59013e9c6acc77385629c9dc278af1b9d950`. `proposalFrom` accepted it. Archive apply returned `executed` false.

## Discovery observation

Saved public GETs at `2026-11-05T00:15:38Z`. Result: `schema_unlinked`. The string `cc0.query-key-caller.v4` is absent from every saved body. These bytes were not patched.

| URL | Status | Bytes | sha256 |
| --- | --- | --- | --- |
| `https://samedaydesk.com/llms.txt` | 200 | 8599 | `4bee826a88bb60f94e67e2bc1b87e0506d5f605aba1ec3d2bb8280b5c19d2c1c` |
| `https://samedaydesk.com/openapi.json` | 200 | 41622 | `9f0ee5168bde5dfa600a744d0f027eeae5b1c8e9b9b813e2283cb3a7a43fc2dd` |
| `https://samedaydesk.com/.well-known/agent-card.json` | 200 | 2780 | `e4720e6e397061a3e9f0204294b1d5bbb9e7d0b3cba15e4130e79aa4681e484d` |
| `https://samedaydesk.com/for-agents` | 200 | 15039 | `6f77d9139b4a06bae0584ad379975fedf47f97c25d68edf19751502bdc0cb7f7` |
| `https://neomorphic.io/llms.txt` | 200 | 15447 | `7ace1842e0c469520a445fbfe374ebb48ef2f3884d1f81c13a3026b69605d5f5` |
| `https://neomorphic.io/machine/participation-0.3.1.json` | 200 | 5968 | `2bb518aa79ec8fdab99356afe35c050d8363f69ea23e6394ba9cce460f7dcd0d` |
| `https://neomorphic.io/downloads/machine-participation/0.3.1/ACCEPTED-WORK.md` | 200 | 7111 | `8edc57f5693ce38e08eb1e57c556132eeff095da19eef7515509ad09d192ce98` |
| `https://neomorphic.io/machine/query-key-1.1.0.json` | 200 | 2918 | `9f5b3529b5eab1ba52a3e4d8b4cf91d9d44a7f0f1bfc04e2e5aa47917c78bd51` |

Local producers on this branch are linked. The live origin was not deployed.

## Cold caller

A fresh process received only the loopback origin and its CA. It started at `/llms.txt` and followed the machine instructions. Recorded run, synthetic task `market-05ef829d8c0c849fcca233ccf305d17cef762e0601d0765d33e6ea4e44f24f04`. That id is not the live task.

| GET | Status | Bytes | sha256 |
| --- | --- | --- | --- |
| `https://127.0.0.1:39873/llms.txt` | 200 | 9406 | `13618da3676c5867ab04ba3780bc6e72dec32aed1140a0c7b6759b09a983dfef` |
| `https://127.0.0.1:39873/for-agents` | 200 | 10685 | `2c14d73bd4635f1d7de054d30c45d408968cb058f938b62c55a640c81c719df2` |
| `https://127.0.0.1:39873/openapi.json` | 200 | 42649 | `e5bdd67d559b42e695777f7ed7cc365aceed4346ec408b4d5f9a75e2cd9fd0d2` |
| `https://127.0.0.1:39873/.well-known/agent-card.json` | 200 | 4195 | `e53686cf3a197c2b32b4a3b42da49180ac6f4e4bfc6a60e5c889d6b53b8c1639` |
| `https://127.0.0.1:39873/api/neomorphic-contributor-journey/v1/market/accepted-work` | 200 | 1814 | `0fb857b0d19308736169c9961459ee0df4006913b83407a4aa8bc96db98d182f` |
| `https://127.0.0.1:39873/api/neomorphic-contributor-journey/v1/market/accepted-work/market-05ef829d8c0c849fcca233ccf305d17cef762e0601d0765d33e6ea4e44f24f04` | 200 | 1699 | `6a011829ffd64e82fd612da8391d402c20d3c6e31570829d6f418bae0d14de21` |
| `https://127.0.0.1:39873/api/neomorphic-contributor-journey/v1/market/accepted-work/market-05ef829d8c0c849fcca233ccf305d17cef762e0601d0765d33e6ea4e44f24f04/artifact` | 200 | 2021 | `60e000ea19a51135eeca318480800271318a6851551dcde12046942e5a7d5572` |
| `https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz` | 200 | 14566 | `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa` |
| `curl -fsSL -o query-key.tar.gz https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz` | 200 | 14566 | `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa` |

Schema: `cc0.query-key-caller.v4`

Runner: query-key 1.1.0, archive `https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz`, sha256 `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa`, 14566 bytes

Acquire: `curl -fsSL -o query-key.tar.gz https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz`

Apply: `node apply.mjs apply --artifact corpus.json --input examples/next-consumer.json`

Source: `https://github.com/epistemedeus/neomorphic-io` commit `bb78211863af9bfb9d18e71ecc32af4ecb0a0902` path `tools/query-key-1.1.0`

Artifact digest: `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`

Apply on that artifact: status 0, `executed` false, wires `lot%23=row%203&seal` and `lot%23=row%203&seal=`.

The exact example command also exited 0 with `executed` false.

## Unknown schema

`node experiments/agl-seed-loop-20261104/seed-return.mjs screen --input experiments/agl-seed-loop-20261104/test/fixtures/unknown-schema.json`

Exit 1. Body: `{"ok":false,"code":"unknown_schema"}`.

The digest function was not called. A trace of that process did not open `execute.py` and did not execute `python3`.

A private field returns `private_field_refused` before the digest. An unknown key returns `unknown_key_refused` before the digest.

## Disposable host

Accepted work answered 404 before publication, with no account. `signerAuthority` was false.

After both parties permitted the served caller, anonymous list, detail, and artifact answered 200 with no account. `paidWork` was false.

A new contributor account then called `POST /api/neomorphic-contributor-journey/v1/market/interest` with `{taskId, note}`. Status 200. The stored note contains the return document and digest `5cb8f9746e4f516b342d0e93520c59013e9c6acc77385629c9dc278af1b9d950`. Task count was unchanged. The financial snapshot was unchanged.

`POST /api/neomorphic-contributor-journey/v1/market/deliverVoluntary` by that contributor: status 403, code `forbidden`.

`POST /api/neomorphic-contributor-journey/v1/market/fund`: status 409, code `qualified_selection_required`. `paidWork` false.

The interest rail exists. The document was stored without a new task. This run is first-party on a disposable host.

## Immutable downloads and 0.3.1 bytes

Re-GET during this handback. Hashes match the saved observation and the committed archive copy.

| Object | Bytes | sha256 |
| --- | --- | --- |
| `https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz` | 14566 | `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa` |
| `https://neomorphic.io/machine/participation-0.3.1.json` | 5968 | `2bb518aa79ec8fdab99356afe35c050d8363f69ea23e6394ba9cce460f7dcd0d` |
| `https://neomorphic.io/downloads/machine-participation/0.3.1/ACCEPTED-WORK.md` | 7111 | `8edc57f5693ce38e08eb1e57c556132eeff095da19eef7515509ad09d192ce98` |
| `https://neomorphic.io/machine/query-key-1.1.0.json` | 2918 | `9f5b3529b5eab1ba52a3e4d8b4cf91d9d44a7f0f1bfc04e2e5aa47917c78bd51` |
| `https://neomorphic.io/llms.txt` | 15447 | `7ace1842e0c469520a445fbfe374ebb48ef2f3884d1f81c13a3026b69605d5f5` |

In-repo `server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs`: 30187 bytes, sha256 `accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`. It is not in the diff. Historical receiving bundles and neomorphic skill projections were not edited.

## Normal next use

Against an origin that serves this branch:

```
node experiments/agl-seed-loop-20261104/cold-caller.mjs --origin https://HOST --ca-file CA
```

The machine instructions name:

```
curl -fsSL -o query-key.tar.gz https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz
node apply.mjs apply --artifact corpus.json --input examples/next-consumer.json
```

Replace the example input with the accepted-work `publicArtifact` to compare that caller. This branch was not deployed.

## Outside use

Outside use means actual control or provenance. A different email, a different IP, or a newly created account is not outside use.

Excluded: Root, Pilot Bots, native workers, controlled panels, and both first-party contribution accounts.

`principal=null` means independence, retention, and return are unknown.

A self-report stays distinct from an observed execution. The interest note is a stored document from an account this run created. The apply result above is an observed execution in this same run. Neither is outside use.

No fingerprint was collected. No retrospective signup was added.

Counts as outside use only with a source link:

1. A public commit, test, issue, or pull request in a repository that epistemedeus does not own and that is not on the pilot service-account registry, containing digest `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`, task `market-8ed4c3f4c4dcbfc074027b1e915064f2294926e03ac4131fe3854d5165806d5a`, or the string `cc0.query-key-caller.v4`.
2. A voluntary delivery or interest on SDS from an account outside Pilot custody whose artifact passes the fence, followed by Root's accept. Which account provenance counts as outside Pilot custody is still unknown.
3. A change in an implementation that collapses a bare key and a blank key, and that cites this artifact. An uncited fix does not count.

Retrieval and discovery with a null principal do not count. Page views, GitHub views, stars, invites, referrals, builder runs, B4 readback, and Root's upstream handback do not count. Our runs are not independent use. No savings claim and no demand claim.

## Next consumer

An implementer whose request-binding key treats `?a` and `?a=` as the same request, while the cited comparison keeps a bare name bare. Identity unknown.

## Unknowns

Whether any outside reader has fetched the artifact is unknown. Whether any live implementation still collapses a bare key and a blank key is unknown. The disposable host stored a return on an already accepted task through interest. The live origin was not changed. Contribution provenance remains unknown. Effect on any purchase-key implementation is unknown. Earlier pull-request dispositions stay as received. Net effort saved is unknown.
