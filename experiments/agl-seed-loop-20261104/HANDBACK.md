# HANDBACK

Branch: `codex/agl-seed-loop-20261104`

Base: `49e6b281f96e876f54bd52836bf0aa5a3d24f357` on `codex/n4-contrib-readiness-20261104`

Implementation commit: `34e8301c7fa009966fc2ddb5d7aca81e0e64dd14`

Implementation tree: `8a0312b01ad9378c0fcc0861168c1465f071334b`

This file is the commit after that implementation commit. The terminal records the branch head.

## Producer paths

These producers sit outside the measured host closure. `hostSourceSha256` is `vendor/hosted-wallet-market/src/native-debt.mjs:89`. It hashes every path in `server/foundry/activation/private-control-pin.json` `files` plus that pin file. `installedSourceSha256` is `native-debt.mjs:86` and hashes `installedSourceFiles()` at `native-debt.mjs:53`. On this branch both stay at the Root-approved measurement: source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`, host `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`.

- `server/lib/query-key-caller.mjs`
- `server/lib/apex-declarations.js`
- `server/lib/apex-agent-card.js`
- `client/public/llms.txt`
- `client/src/data/machineEntry.mjs`

`server/app.js`, `server/foundry/activation/private-control-pin.json`, and `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` are inside that closure. Their bytes match the approved measurement again. The accepted-work list, detail, and artifact responses therefore do not grow a consumer field. The artifact schema is `value.publicArtifact.schema` on the raw accepted-work artifact body `{ok, value}`. `publicArtifact` at the root of that body is not a field. The runner, acquire command, apply command, and source identity are rendered by the producers above. `mountApexDeclarations` serves `/llms.txt` from `client/public/llms.txt` and, outside production, serves `/for-agents` from the existing crawler copy.

No pulse counter was incremented. No new outcome class was added. `publicReads` was not edited.

## Experiment paths

- `experiments/agl-seed-loop-20261104/README.md`
- `experiments/agl-seed-loop-20261104/HANDBACK.md`
- `experiments/agl-seed-loop-20261104/cold-caller.mjs`
- `experiments/agl-seed-loop-20261104/envelope-check.mjs`
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

A fresh process received only the loopback origin and its CA. It started at `/llms.txt` and followed the machine instructions. Recorded run, synthetic task `market-3431c65ed60836402fe44f874440be38f0b052b50f459f55ecb48f2d318b1591`. That id is not the live task. The artifact was read at `value.publicArtifact` on the raw body. `publicArtifact` at the root of that body is absent.

| GET | Status | Bytes | sha256 |
| --- | --- | --- | --- |
| `https://127.0.0.1:34677/llms.txt` | 200 | 9612 | `fc4f79c6424c27136c1471feca9cd8d449744e1bc23f197197ad0f09bbdd11bf` |
| `https://127.0.0.1:34677/for-agents` | 200 | 10883 | `736715fd6d6fe4cc796d6f96c8cef78fabaa01a229f5265a1e7ba9c24b6e627b` |
| `https://127.0.0.1:34677/openapi.json` | 200 | 43072 | `cdeb56f2e461fdc2a6e458e7fc63a684797702d51aec345093f5b2caf741e50f` |
| `https://127.0.0.1:34677/.well-known/agent-card.json` | 200 | 4479 | `7177c798eb0bfe8aeb6a84f09f4acb9c351a48b7b4bbda7712532037f95a820f` |
| `https://127.0.0.1:34677/api/neomorphic-contributor-journey/v1/market/accepted-work` | 200 | 1098 | `032cc6896147da6e793c2cd8ade31168ceb8064bc31e8490e09a1b1bbdc25ec5` |
| `https://127.0.0.1:34677/api/neomorphic-contributor-journey/v1/market/accepted-work/market-3431c65ed60836402fe44f874440be38f0b052b50f459f55ecb48f2d318b1591` | 200 | 983 | `e8b312e6dd7f44603d1da0cb6521e8b2e5aad42cdf46d1e06b63d288ff10d533` |
| `https://127.0.0.1:34677/api/neomorphic-contributor-journey/v1/market/accepted-work/market-3431c65ed60836402fe44f874440be38f0b052b50f459f55ecb48f2d318b1591/artifact` | 200 | 1305 | `bf4aa01de885c8b27ed20fc4a1bec65e5dec89114c3bcb2d949d2a6c7fcd412b` |
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

The documented extraction paths are members of the raw HTTP body. For accepted work that body is `{ok, value}`. `envelope-check.mjs` resolves each path against the cold caller's saved raw body. The parent test `a cold caller follows the machine instructions and a new contributor can return the document` exited 0.

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

Replace the example input with the object at `value.publicArtifact` on the raw accepted-work artifact response. This branch was not deployed.

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
