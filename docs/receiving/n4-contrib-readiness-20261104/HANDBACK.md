# TERMINAL N4-CONTRIB-READINESS

Branch `codex/n4-contrib-readiness-20261104`. Parent `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9`, tree `c5e12e30fec8f56806d69741f4c3eb3aef1adcc2`. Installed source `0593026ad155352f263e4749dc889a1578d91675`, tree `c45303df5350ce899467c840cd0803a1613959a3`. Root named the installed build `01a1a514`. That build id string is not in this git tree. No pull request. A pull request into `codex/nov04-qualified-reuse-integration` was forbidden. A pull request into `main` would carry the unmerged proposed tree.

This outcome publishes nothing. It writes no provider, store, or config, and it changes no human page. The head SHA of the commit that adds this directory is the commit on this branch after the packet commit. Writing that SHA into this file would change the commit, so the pushed head is the git head of this branch.

## Result

The ordinary accepted-work path is already on installed source `0593026a` and is byte-identical on proposed `f4fba79f`. No ordinary step needs the pending f4 runtime or enrollment. The smallest useful first-party artifact the installed path already supports is the H133 public mapping below. The anonymous route stays unmounted on the installed process while `acceptedWorkPublic` is unset. That unset state is the installed source's own rule, in `docs/reviews/h133010-opt-in-accepted-work/NEXT.md`. It is not an f4 gap and this packet does not flip it.

## Same bytes

| Path | Blob on `0593026a` and on `f4fba79f` |
| --- | --- |
| `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` | `b5d8de857f77` |
| `vendor/hosted-wallet-market/client/accepted-work-source.mjs` | `9b15eead8d73` |
| `vendor/hosted-wallet-market/src/voluntary-market.mjs` | `e275901c9f43` |
| `vendor/hosted-wallet-market/src/machine-market.mjs` | `dd145977f840` |
| `vendor/hosted-wallet-market/examples/participation-canary.mjs` | `38f02480151b` |
| `server/scripts/test-h133010-accepted-work.mjs` | `46e9d7179413` |
| `server/scripts/test-h136010-accepted-work-release.mjs` | `2b35801a04a5` |
| `vendor/hosted-wallet-market/test/fixtures/h142010/query-key-collision.json` | `6b342209d428` |

Line numbers below are the lines of those shared blobs. Prefix for every route: `/api/neomorphic-contributor-journey` (`vendor/hosted-wallet-market/src/server.mjs:28`).

## Ordinary path

f4 required is `no` on every row. Supported today means the installed source already contains the route, the client command, and the test. The installed process serves the anonymous GETs only when the existing profile boolean is true.

| Step | File:line | Route or command | Who receives | Supported today | f4 |
| --- | --- | --- | --- | --- | --- |
| 1. Profile | `server.mjs:1691-1692`; `machine-market.mjs:419-426` | `GET /v1/market/profile`. Cold client `profile` at `cold-requester-0.3.0.mjs:221` | Any caller. `acceptedWork` appears only when the flag is on: schema `pilot.machine-market.accepted-work-publication.v1`, `publicReads` `0`, `paidWork` false, `signerAuthority` false, discovery `/v1/market/accepted-work`. `capability.acceptedWorkPublic` is not a public profile field | Yes. Flag gate: `voluntary-market.mjs:28-29`, `server.mjs:354-367`, `machine-profile-document.mjs:44`, CLI `bin/machine-profile.mjs:23-25`. Mount default leaves the boolean unset: `server/lib/hosted-wallet-market-mount.js:100-101` | no |
| 2. Signup | `cold-requester-0.3.0.mjs:247` | `POST /v1/account/signup`. Cold client `signup` | The new account holder | Yes. Anonymous retrieval does not use it. Do not impose it on old obligations | no |
| 3. Post | `machine-market.mjs:237,308,328`; `runtime/agent-economy-market/src/market.mjs:75` | `POST /v1/market/post`. Cold client `post` | Requester receives `taskId` | Yes | no |
| 4. Open discover | `server.mjs:1697-1698`; `machine-market.mjs:406-417` | `GET /v1/market/discover`. Cold client `discover` at `cold-requester-0.3.0.mjs:229` | Anonymous caller. Rows are `voluntary IS NULL` only | Yes | no |
| 5. Interest | `machine-market.mjs:237,309,326` | `POST /v1/market/interest`. Cold client `interest` | Contributor writes the note. Requester lists it | Yes | no |
| 6. Offer | `voluntary-market.mjs:161-177` | `POST /v1/market/offerVoluntary`. Cold client `act --action offerVoluntary` | Requester writes terms. Selected contributor reads them on inspect | Yes. Rights keys are exactly `license`, `scope`, `attribution`. License const `CC0-1.0`. Scope const `synthetic-or-authorized-reusable-artifact`. Attribution is a party string, 1 to 512 bytes | no |
| 7. Inspect | `cold-requester-0.3.0.mjs:278-284` | `POST /v1/market/readVoluntary`. Cold client `inspect` | Selected contributor receives the private spec | Yes | no |
| 8. Assent | `voluntary-market.mjs` assent branch, dispatched at `machine-market.mjs:305` | `POST /v1/market/assentVoluntary` | Contributor | Yes. Requires `authorizedToShare` true and the exact spec digest | no |
| 9. Deliver | `market.mjs:188-198` | `POST /v1/market/deliverVoluntary` | Contributor sends private evidence. Requester reads it on inspect | Yes. Evidence keys: `kind`, `businessResult`, `attempts`, `criterionResults`, `nextDecision`. Kinds: `usable`, `no_fit`, `failure` | no |
| 10. Review | `voluntary-market.mjs` review branch | `POST /v1/market/reviewVoluntary` | Requester. Both parties can inspect the decision | Yes. One shot. `exportAuthorized` may be false and publication still proceeds. Acceptance creates no payment | no |
| 11. Permit | `server.mjs:1718-1721`; `voluntary-market.mjs:248-252`; `accepted-work-publication.mjs:137-185` | `POST /v1/market/permitAcceptedWork`. Source client `permit` at `accepted-work-source.mjs:160-179` | Requester, then contributor, same proposal. Anonymous callers receive nothing until both digests match | Yes in source. The 0.3.0 client refuses this action at `cold-requester-0.3.0.mjs:174` and `:261` before HTTP. The route answers only while the flag is on. One-sided permit returns `acceptedWorkVisible` false | no |
| 12. Permit readback | `accepted-work-source.mjs:181-191` | `POST /v1/market/readbackVoluntary` via source client `readback --operation permitAcceptedWork` | The party whose response was lost. Does not resubmit | Yes. Committing readback has `acceptedWorkVisible` true, `paidWork` false, and the same revision, terms digest, and private artifact digest | no |
| 13. Anonymous list, detail, artifact | `server.mjs:1700-1716`; `machine-market.mjs:364-402`; `accepted-work-source.mjs:140-158` | `GET /v1/market/accepted-work`, `GET /v1/market/accepted-work/{taskId}`, `GET /v1/market/accepted-work/{taskId}/artifact`. Commands `discover-accepted`, `detail`, `artifact`. No secret file | A distinct anonymous consumer. List returns summary and continuation links and omits `publicArtifact`. Detail omits the artifact body. Artifact returns the public bytes. `Cache-Control: no-store` | Yes in source and in the mounted harness. The installed process does not mount these GETs while the flag is unset (`server.mjs:1700`, `machine-market.mjs:384`) | no |
| 14. Changed input | `server/scripts/test-h133010-accepted-work.mjs:264-267` | Local application of `mapping`. No server route | The anonymous consumer, on the returned bytes | Yes. Input `{external_id:"changed-row-17", extra:"not-part-of-the-private-export"}` yields `{id:"changed-row-17"}` | no |
| 15. Optional later grant and export | `voluntary-market.mjs:179-184` and grant branch; continuation links `accepted-work-publication.mjs:233-238` | `grantVoluntary`, `exportVoluntary`, `useVoluntary` | A later signed-in account chosen by the requester | Yes. Not required to retrieve the public artifact. `useVoluntary` is an authenticated self-report. Independence of that report is unknown. Publication withdrawal hides the public routes and keeps prior private grants | no |

`fund` stays unpaid. The unfunded profile refuses paid work. Do not fund.

Rights are party declarations. The server checks the consts and the attribution length. It does not verify title. Offer writes terms schema `pilot.machine-market.voluntary-terms.v1` with `funding` `voluntary`, `contributionRequired` false, `paymentAuthority` `none`, `requesterReviewRequired` true, `exportRequiresBothParties` true, plus the live `sourceSha256` and `hostSha256` (`voluntary-market.mjs:173-176`). Publication checks the same license and scope again (`accepted-work-publication.mjs:149-151`). The same consts are in `contracts/voluntary-participation.openapi.json` under `offerVoluntary` and in `PARTICIPATION.md:59` and `:75-77`. No file in this repo is named H124. The pilot repository was not readable with this token (one 404). That document stays unknown. Unknown is not treated as zero and is not invented.

Foundry contribution transport (`server/scripts/test-foundry-contribution-transport.js`, header `x-foundry-contribution-terms`) is a different terms channel on the installed source. It is not this path and it does not need f4.

## Smallest artifact the installed path already supports

Exact object already permitted and anonymously retrieved by `server/scripts/test-h133010-accepted-work.mjs:20-28`. Copies: `seed-artifact.json`, `public-summary.txt`, `rights.json`, `changed-input.json`.

```json
{"mapping":[{"from":"external_id","to":"id"}],"version":1,"source":"export const normalize = value => value.trim();\n","reproduction":"https://example.org/public/mapping.json"}
```

Summary: `Chosen consumers can request this accepted mapping through the private continuation.`

Rights: `{"license":"CC0-1.0","scope":"synthetic-or-authorized-reusable-artifact","attribution":"Owner QA synthetic compatibility vectors"}`. Same attribution as `examples/participation-canary.mjs:88`.

Digests from the foundation digest (sorted keys):

- public artifact `d923e38f9da76f9d5ff1a36ff491fc09e489a7a1baf2f7a4cb8193af14053410` (176 bytes of canonical JSON)
- summary `2107be5cb6532a332b10f64c55bcff05e345b5c1c52c32ef1908867400df77de`
- rights `f6a05f408dae82c9a01708d20506c6e7e033f06a7d85a998ee874cfeac427551`
- private canary evidence `f1d716a2e4472aaef9013802bb7f642d7b6d307de19681c14723636401e19c0a`

The public digest and the private evidence digest differ, so the publication fence accepts this object when the private evidence stays the canary vector. The server does not fetch `reproduction` and does not run `source`.

This is owner-QA synthetic first-party material. It is not an outside contribution. The H142 corpus `query-key-collision.json` is also on `0593026a` and is a larger first-party seed that needs an external codec. The empty-value fixture is a fence case. The AGL roster under `experiments/agl-contribution-delegation-20261104` exists only on `f4fba79f`, leaves `acceptedWorkPublic` false, and is not this artifact.

## Read-only checks and the write Root keeps

Read-only, and the only commands this outcome relies on:

1. Stay on installed source `0593026a` (build `01a1a514` as Root named it). Do not deploy `f4fba79f` in order to publish this artifact. The proposed host pin `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd` is unreceived. The source client copies `sourceSha256` and `hostSha256` from the live profile (`accepted-work-source.mjs:172`) and refuses caller-supplied hashes.
2. `node vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs profile --origin ORIGIN`. Record the live hashes. While the flag is unset, `acceptedWork` is absent. That is the installed behavior in `NEXT.md`.
3. Compare `seed-artifact.json` to the object above and to digest `d923e38f9da76f9d5ff1a36ff491fc09e489a7a1baf2f7a4cb8193af14053410`.

The authorization write stays with Root. This packet does not perform it. There is no single POST that publishes. After the private journey is accepted, and only on a process whose reviewed profile already mounts the route, Root sends the same proposal twice:

- requester: source client `permit` with `publicationConsent` true, the summary, the seed artifact, and the four digests
- contributor: the same proposal

If a response is lost, `readback --operation permitAcceptedWork` returns the committed row and does not POST again. Expected committing readback: `acceptedWorkVisible` true, `paidWork` false, unchanged terms digest, private artifact digest `f1d716a2e4472aaef9013802bb7f642d7b6d307de19681c14723636401e19c0a`. Requester-only permit: `acceptedWorkVisible` false and anonymous detail `not_found`.

The profile boolean is a separate reviewed activation already specified on `0593026a` (`NEXT.md`, `machine-profile.mjs:23-25`). H133 says to leave it unset on the installed host. This outcome does not set it, does not enroll, and does not treat that activation as an f4 step.

## Anonymous consumer on the changed input

No secret file. Commands on the source client: `discover-accepted --limit 20`, `detail --task-id TASK`, `artifact --task-id TASK`.

Expected artifact body equals `seed-artifact.json`. Expected local application, from the harness at lines 264-267:

- input `changed-input.json`: `external_id` `changed-row-17`, `extra` `not-part-of-the-private-export`
- output `{id:"changed-row-17"}`

List and detail omit the artifact body. Measures `accepted_work_discovery` and `accepted_work_retrieval` use actor `anonymous`, `externalUse` false, `paidWork` false, `uniquePrincipal` null. They are owner QA, not outside use. Signup, interest, grant, and export appear as continuation links. The GET itself does not require them.

## What actually needs f4

None of the rows above. These proposed-tree items are not dependencies of this publication:

- `experiments/agl-contribution-delegation-20261104` (private handback, flag left false)
- pulse credential-explicit reader
- `tools/result-reuse`
- embed useful-jobs
- `package.json` and `private-control-pin.json` host pin `6fca4aaa` (unreceived, unqualified, unenrolled)
- `vendor/hosted-wallet-market/SOURCE.json` recorded `installedSourceSha256` constant, which is not the publication authority
- native enrollment, Hostinger, WURK, and the f4 CI packet

## Local proof

Command: `node --test --test-concurrency=1 server/scripts/test-h133010-accepted-work.mjs`

Result: 2 tests, 2 pass, 0 fail, 0 skipped. Duration about 14 seconds. The harness uses a disposable local Postgres 16 cluster and loopback TLS. It does not publish to a provider, store, or live host. It is owner QA on the shared blobs, not independent outside use. The checkout also contains f4 files. The accepted-work modules under test are the `0593026a` blobs listed above, and the harness does not import the AGL experiment.

No product source change. The mounted path already accepts this public object while the private evidence remains the canary vector.

## Unknowns

- Build id `01a1a514` is Root's name for the installed build. The string is not in this repository, and this outcome did not read the live process.
- Whether an operator has already set the profile boolean on the live host is unknown. The source default and `NEXT.md` leave it unset. This outcome did not query the live host.
- The pilot H124 document is unread because `epistemedeus/pilot` returned repository not found.
- `useVoluntary` independence is unknown.
- This run is not outside use, revenue, or a network effect.

## Correction, recorded

The section above treated the source default as the live process. That inference was wrong and stays in the record. `acceptedWorkPublic` is unset in source unless a profile sets it (`server/lib/hosted-wallet-market-mount.js:100-101`, `docs/reviews/h133010-opt-in-accepted-work/NEXT.md`). A source default is not the configured process state.

At 22:38 UTC Root's public GET of `/api/neomorphic-contributor-journey/v1/market/profile` returned 200 with `acceptedWork` schema `pilot.machine-market.accepted-work-publication.v1`, `publicReads` `0`, `paidWork` false, `signerAuthority` false, and discovery `/v1/market/accepted-work`. This outcome's later read-only GET agrees. The live accepted-work list returns 200 with an empty list, not 404.

The H133 `example.org` mapping in the section above was the wrong artifact for this completion. It stays recorded as that earlier choice. The useful artifact is the query-key 1.1.0 corpus below.

## Live read, 2026-11-04T22:41:13Z

Public SDS origin `https://samedaydesk.com`, from `research/06-hostinger-deploy.md` (deploy target `samedaydesk.com`) and `docs/reviews/sol-sds-visitor-delivery-261003/PRODUCTION-READBACK.json` (`origin`). `vendor/hosted-wallet-market/PARTICIPATION.md:27` uses the same origin. The live profile `capability.origin` is that origin. No other origin was tried.

Plain GETs only. Nothing was funded, signed up, posted, or permitted.

| GET | Status | Bytes | sha256 of the body |
| --- | ---: | ---: | --- |
| `/api/neomorphic-contributor-journey/v1/market/profile` | 200 | 3449 | `5d3433c4d64120239eef2aa9bd9f4fe849bbaf360d3767e042a69a1121041ac5` |
| `/api/neomorphic-contributor-journey/v1/market/accepted-work?limit=20` | 200 | 135 | `c6a47004c3ed441a3cbef69ea8d528ddf8f1c6cf3f5c5e67c77238da4fc3f013` |

Both responses: `content-type: application/json; charset=utf-8`, `cache-control: no-store`, `x-ae-wire-version: c0-1`, `x-ae-server-class: live`.

Live capability: `sourceSha256` `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`, `hostSha256` `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`, `money` `unfunded`, `participation` `voluntary-artifact-v1`, tenant `samedaydesk-private`. `acceptedWork` is the object Root reported. `signerAuthority` is false. The list body is `{"ok":true,"value":{"items":[],"nextCursor":null,"acceptedWorkPublic":true,"publicReads":"0","paidWork":false,"signerAuthority":false}}`. `items` is empty, so no detail GET was sent.

The live host hash is `8f8ce3b3`, the measured installed closure. It is not the proposed f4 pin `6fca4aaa`. The profile `participation.actions` list matches `voluntary-market.mjs:262-264`: the public descriptor omits `permitAcceptedWork` even when publication is on. The mounted evidence is the `acceptedWork` object and the 200 list. This outcome did not POST.

## Query-key 1.1.0, read from the published Neo entry

Published entry `https://neomorphic.io/machine/query-key-1.1.0.json`. Status 200, 2918 bytes, sha256 `9f5b3529b5eab1ba52a3e4d8b4cf91d9d44a7f0f1bfc04e2e5aa47917c78bd51`. Schema `neomorphic.query-key-1.1.0.entry.v1`. `sourceRepository` `epistemedeus/neomorphic-io`. `sourceCommit` `bb78211863af9bfb9d18e71ecc32af4ecb0a0902`. `sourcePath` `tools/query-key-1.1.0`. `license` `CC0-1.0`. `hostedAcquisitionVerified` false. `humanPage` false. `walletCalls` 0. `liveSettlement` false.

The entry names the archive `/downloads/query-key/1.1.0/query-key.tar.gz`. GET 200, 14566 bytes, sha256 `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa`. Twelve members. The corpus member `corpus.json` matches the entry's separate corpus URL: 5219 bytes, sha256 `060c8aa08ca58c665f1b610d4cccbb9800a53f16f242d2f22bed496dd6c201d6`, schema `cc0.query-key-cases.v4`.

`https://neomorphic.io/llms.txt` at the same time was 200, 14196 bytes, sha256 `d4b87c2025d8c9e4d54acef97b340c4fe5dafa83fe66a9b28ca320079d70ebb1`, and it has no query-key line. The versioned machine entry is still published. This outcome does not edit that index.

The unversioned `https://neomorphic.io/machine/query-key.json` is a different publication: 200, 2160 bytes, sha256 `67445e443ec1e6c08f082a135d82d28df168a84c4d9078c8e89caa5310a9d6e7`, `sourceCommit` `027432d7cadd597daecf51de808ed7b0ab0e8f93`, archive 13443 bytes `45e933d2b1f2bd7bc2736142d447c7561a936be4d84f3ab2ea23be6d73f88d6e`. Its corpus URL is schema `cc0.query-key-cases.v3`, 3039 bytes, sha256 `ba40feee52cb1de06f5eb7fab1a25f489d8bc8b1639461987297205d8834461a`, 13 cases. That is not the 1.1.0 archive.

## H124 sources now read

The earlier "no H124 file" line was an input-availability miss. The pilot repository was not readable with the earlier token. The sources at pilot `9d5bf8ef` are in the Lead store and were read:

- `/cursor/stores/bot/n4-cohort2/b4-amend-inputs/H124010-COOPERATIVE-ARTIFACT-HANDBACK-20261103.md`. Ordinary handoff on the existing client: offer, assent, one delivery, requester acceptance, explicit export authorization, grant to a later consumer, export and use. Installed SDS named there is `b28b3c00`. Client 0.3.1 is `accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`, 30187 bytes. Rights stay explicit. An export is not a customer or revenue.
- `/cursor/stores/bot/n4-cohort2/b4-amend-inputs/H124-AMENDMENT-1-REQUIREMENTS.md`. The public guide is a normal route for one role at a time. Negative controls and synthetic fixtures stay in private receiving.
- `query-key-collision.json`, the retained public copy, 2872 bytes, sha256 `491c4562ab9acdb316983ddddd56fcea9df84ffdc1f5a7a54d6f44ff4a654a2f`.
- `seed-INVENTORY.md`, `seed-LIMITS.md`, `seed-PROVENANCE.md`, `seed-ROOT-RECEIVING.md`, `seed-NEXT.md`.

`seed-PROVENANCE.md` rights text: license `CC0-1.0`, scope `synthetic-or-authorized-reusable-artifact`, attribution `First-party seed. Not a customer and not an independent contributor.` `customerDemand` and `independentContributor` are false. Compact JSON digest of that retained artifact is `7b5e1821cc2f1b513caecca226003095d7e494348f89cfdde577e8b3f1f181a7`. This outcome recomputed the same foundation digest. The seed summary file (63 bytes, file sha256 `246c55e225e138ba118b66abadb3f5465198a7a6d29d54410acf969f77fc9216`) and the private `delivery.json` (714 bytes, file sha256 `c4e6e966c28d99844fb7578b8b109234e8da035a6495d1dbd2fb534c23be4296`) are not in the Lead store. Their preimages were not reconstructed.

## Comparison

The Lead-store `query-key-collision.json` and `vendor/hosted-wallet-market/test/fixtures/h142010/query-key-collision.json` are the same 2872 bytes and the same sha256 `491c4562ab9acdb316983ddddd56fcea9df84ffdc1f5a7a54d6f44ff4a654a2f`. Schema `cc0.query-key-cases.v2`, codec `urllib.parse.urlencode`, 12 cases, 39 strings, canonical JSON 1976 bytes. Those 12 case ids are a subset of the 1.1.0 ids. The file is not a member of the 1.1.0 archive.

The 1.1.0 archive corpus is schema `cc0.query-key-cases.v4`, codec `urllib.parse.quote`, 25 cases, bank length 22, `role` `first-party-seed`, `customerDemand` false, `independentContributor` false. `CC0.txt` in the archive dedicates the corpus and recipe to CC0 1.0 and leaves the upstream MIT sources out. The v3 hosted corpus is a third object, 13 cases, and it is not byte-equal to the seed copy.

## Validators and the fence

The 1.1.0 shape owner is `contract.mjs` `assertCorpus`. Local `node apply.mjs decode --artifact corpus.json` returned ok, schema `cc0.query-key-cases.v4`, 25 cases, `executed` false. The caller shape owner is `execute.py` `read_caller` (`cc0.query-key-caller.v4`). Local `node apply.mjs apply --artifact corpus.json --input examples/next-consumer.json` with no checkouts returned ok, `executed` false, `actual` null, `walletCalls` 0, `connectAttempts` empty. Equality is unknown without the three caller checkouts. That run is not outside use.

The publication fence that would carry a public artifact on the live SDS path is `vendor/hosted-wallet-market/src/accepted-work-publication.mjs`. It is the same blob on `0593026a` and `f4fba79f`. `proposalFrom` on the v4 corpus, with the retained rights object and the private canary evidence, returns `publication_refused`. The first check that fails is line 105: canonical JSON is 4485 bytes and the limit is 4096. The walk would also stop at string 41 (`cases[13].id`, `bare-versus-blank`); the corpus has 90 strings and the limit is 40 (line 111). The empty bank scalar is not the refusal. No smaller object was invented.

The same `proposalFrom` accepts the retained v2 corpus. That is the H142 fixture the mounted test already publishes. It is not the 1.1.0 artifact, and `assertCorpus` would refuse it because the schema, codec, and case count differ.

Digests, foundation digest unless noted as a file sha256:

| Item | Digest |
| --- | --- |
| v4 public corpus, foundation | `e2ebad293377bbeb3e3278d2abedc2068e55a8308b0708175dcc10d7c942642b` |
| v4 corpus file | `060c8aa08ca58c665f1b610d4cccbb9800a53f16f242d2f22bed496dd6c201d6` |
| Rights object from `seed-PROVENANCE.md` | `efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550` |
| Summary `Approved reusable query comparison sample.` (the sentence `test-h142010-empty-artifact-data.mjs:168` already pairs with the retained corpus) | `b66ce30bd20d3aa540a17d541a19b230eb09f149487ad3478ebfdd777cc64fc2` |
| Private canary evidence used by that installed harness | `f1d716a2e4472aaef9013802bb7f642d7b6d307de19681c14723636401e19c0a` |
| Retained v2 corpus, foundation | `7b5e1821cc2f1b513caecca226003095d7e494348f89cfdde577e8b3f1f181a7` |

The v4 foundation digest differs from the canary evidence digest. The 1.1.0 archive has no private-evidence member. The seed `delivery.json` foundation digest is unknown because the file is not in the store.

Rights for an offer, if a fence-accepted artifact were used: `{"license":"CC0-1.0","scope":"synthetic-or-authorized-reusable-artifact","attribution":"First-party seed. Not a customer and not an independent contributor."}`. The license const and scope const are the live path's own checks at `voluntary-market.mjs:167` and `accepted-work-publication.mjs:150`.

## Command packet

Anonymous reads are supported on the live process. They are not Root writes. This outcome already ran them.

The ordinary write packet for the 1.1.0 corpus is not supported on that live path. `permitAcceptedWork` of this corpus does not pass the installed fence, so no permit command is issued for it. Root writes below are named so the boundary is visible. None were run. None should be run for this corpus.

| Step | Command | Who | Root write | Live support for the v4 corpus |
| --- | --- | --- | --- | --- |
| Profile | `node vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs profile --origin https://samedaydesk.com` | Any caller | no | Yes. Observed 200 with `acceptedWork` |
| Accepted-work list | `node vendor/hosted-wallet-market/client/accepted-work-source.mjs discover-accepted --origin https://samedaydesk.com --limit 20` | Anonymous | no | Yes. Observed 200, empty `items`, no detail |
| Signup, post, interest, offer, assent, deliver, review | Cold client `signup`, `post`, `interest`, `act` on the live origin, first-party accounts Root already holds | Requester and contributor | yes | The routes exist on the live source hash. They do not make this corpus publishable |
| Two permits of one proposal | Source client `permit` with `publicationConsent` true, the v4 corpus, and the digests above | Requester, then contributor | yes | No. Local `proposalFrom` returns `publication_refused` before a commit |
| Anonymous artifact GET | Source client `artifact` | Anonymous | no | No item exists. The list is empty |

f4 is not required for the live reads, and it does not remove the fence refusal. Enrollment is not required for the reads. No publish, provider, store, config, or human-page change was made.

## Seed packet Root can run

Superseded as the permit target. Root permits `query-key-caller.json`. `query-key-seed.json` stays in the tree as the record of this 9-case selection. The archive caller refuses it, so it is not the publication object.

The 9-case selection was `query-key-seed.json`. It is a fence-bound selection from the retained v2 corpus and the B1 comparison at neomorphic-io `d5ef2a20092aafa77a178b0ff4e8526fd25022d3` (PR443). The archive `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa` is unchanged. The H133 mapping file `seed-artifact.json` stays in this directory as the earlier recorded choice. Do not permit that file.

`proposalFrom` accepts this selection. Canonical JSON is 1421 bytes. String values are 40, which is the current limit at `accepted-work-publication.mjs:111`. The canonical limit at line 105 stays 4096. This packet does not ask for either limit to rise. Adding one more string is `publication_refused`. The v4 `assertCorpus` in the previously fetched archive contract refuses this 9-case object with `artifact_refused`, because that contract still requires 25 cases and a bank of 22. The contract was not edited.

License `CC0-1.0`. Codec on the selection is `urllib.parse.quote`, the 1.1 codec. The six retained v2 cases keep their stored expectations. Their `nowEqual` is the 164d9e30 comparison from the v2 packet. The 9cdf0e47 result for those six is unknown. The percent-encoded key is not stored. Both the 1.1 caller validator and the publication fence refuse that literal. The case records `representation_refused` and `stored` false.

| Case | Provenance | Expectations in the artifact |
| --- | --- | --- |
| `grouped-ampersand` | retained v2 `491c4562`, f0b3e894 collides, 164d9e30 separates | old true, now false |
| `pair-in-one-value` | same v2 file | old true, now false |
| `path-delimiter` | same v2 file | old true, now false |
| `unicode-key` | same v2 file | old true, now false |
| `dict-list` | same v2 file | old false, now true |
| `pair-order` | same v2 file, the control that still fit | old true, now true |
| `bare-versus-blank` | B1 `inputs/direct-lot.json` and the same class on cold-bin, hosted-shelf, adapt-tray | old true, mid true, now false. Current mount 200 then 409 |
| `trailing-space-key` | B1 `inputs/trailing-space-key.json` | old true, mid true, now false. Current status 200 then 409 |
| `percent-encoded-refusal` | B1 `inputs/percent-encoded-key.json` | `representation_refused` before checkout. Encoded key omitted |

Full per-case notes are in `case-provenance.json`. That file is not the public artifact. Caller documents Root's consumer runs are `callers/direct-lot.json` and `callers/trailing-space-key.json`. They are JSON-equal to those B1 inputs. Their file sha256 values are `9f71900affa6bd90d7a736175ad5ce3fcac0e5c2511369fd6b967934db8d5e5f` and `cfff34df498140af3723aa904b95c92a1333226a476aea14148dbfb0b490d48b`. GitHub raw download with this environment's `gh` token returned 404, so byte-identity with the git blob was not rechecked. The GitHub contents read of those two files supplied the JSON.

Digests:

| Item | Value |
| --- | --- |
| Public artifact, foundation digest | `b142e79f055fdf6a2af863a9b344bf4eb4257d5b97bac02ffeefc2ff7251232b` |
| `query-key-seed.json` file sha256 | `0eac1c7b523317d3c7114ea0780205c4bf96744ffb0bacaaffcb4fefc3797b15` |
| Summary file, 102 bytes, no trailing newline | `eee5a5bd50c808b38c089ca21d3041da89519723ac00368a93e326ddcdf25ff2` |
| Summary, foundation digest | `4f07cb0db1756b5a09f94b982bcce40e271e016b2fc0a922c9d232425285992d` |
| Rights, foundation digest | `efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550` |
| Proposal digest beside the installed canary evidence | `a6709bb7b871dc2f3d86ebaacef5de471bebc01d8d8afe7f0baa4407f9c356eb` |

The summary string is `First-party query-key comparisons for a later consumer. Bare and blank keys differ on the current pin.` Rights are `query-key-rights.json`: license `CC0-1.0`, scope `synthetic-or-authorized-reusable-artifact`, attribution `First-party seed. Not a customer and not an independent contributor.` `consent.json` is `{"publicationConsent":true}`.

The private artifact digest Root puts on the permit is the digest from Root's own delivery receipt. It is unknown until that receipt exists. It must differ from `b142e79f055fdf6a2af863a9b344bf4eb4257d5b97bac02ffeefc2ff7251232b`, and a private string of 8 or more characters must not occur inside the public artifact. The canary evidence digest `f1d716a2e4472aaef9013802bb7f642d7b6d307de19681c14723636401e19c0a` is only the local fence proof. It is not a live delivery.

## Profile evidence, 2026-11-04T22:58:37Z

Read this turn, plain GET:

| GET | Status | Bytes | sha256 |
| --- | ---: | ---: | --- |
| `https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile` | 200 | 3449 | `5d3433c4d64120239eef2aa9bd9f4fe849bbaf360d3767e042a69a1121041ac5` |
| `https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/accepted-work?limit=20` | 200 | 135 | `c6a47004c3ed441a3cbef69ea8d528ddf8f1c6cf3f5c5e67c77238da4fc3f013` |

Same hashes as the 22:41:13Z read. `sourceSha256` `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`. `hostSha256` `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`. `acceptedWork` present. List `items` empty. Header date `Wed, 04 Nov 2026 22:58:37 GMT`. `cache-control: no-store`. `x-ae-server-class: live`.

Also read this turn: `https://neomorphic.io/machine/participation-0.3.1.json`, 200, 5968 bytes, sha256 `2bb518aa79ec8fdab99356afe35c050d8363f69ea23e6394ba9cce460f7dcd0d`. `hostedAcquisitionVerified` false. `requiredProfile` source and host hashes match the live profile. `descriptorSha256` `de60c5132911c0a27823f193ff100ffd3b832f56def9b9f5cfb32447ec2fd6ad`. Guide `ACCEPTED-WORK.md` sha256 `8edc57f5693ce38e08eb1e57c556132eeff095da19eef7515509ad09d192ce98`, 7111 bytes, matches the entry. Prepare script sha256 `2465ee5f799545a97af3b036fe5962d5218e9ba4a998803995b8500cf059e5fe`, 4110 bytes.

Not read this turn, so source-only: the 14566-byte archive body, the live `llms.txt` body, account files, and any private task row. The public list does not show private tasks. Whether Root already has an accepted voluntary task is unknown.

## Commands Root runs

Superseded by the caller publication below. The commands in that section are the ones Root runs. The digest and file names in this older block named `query-key-seed.json`.

No new signup. No credential file is in this packet. Keyway locator strings are unknown. The only custody path in the read inputs is `/home/ubuntu/root97253-first-party-accounts` from `seed-ROOT-RECEIVING.md`. The published guide names the existing files `requester.secret` and `contributor.secret`. Root substitutes those existing files. This packet does not open them.

Download the three published tools once, then check the entry hashes above. `prepare-accepted-work.mjs` writes the permit body and does not post it. The summary file must be the 102 bytes with no trailing newline, because the prepare script digests the file bytes and the fence rejects surrounding whitespace.

These steps are Root writes. They were not run.

1. If no accepted voluntary task exists yet, the ordinary enrolled-account path is cold client `post`, `interest`, `act --action offerVoluntary` with `query-key-rights.json`, contributor `inspect`, `assentVoluntary`, `deliverVoluntary`, requester `reviewVoluntary`. Copy `termsDigest` and `artifactDigest` from that receipt. Do not fund. Do not sign up.
2. Prepare the requester permit. Expected stdout includes `posted` false, `publicationConsent` true, `summaryDigest` `4f07cb0db1756b5a09f94b982bcce40e271e016b2fc0a922c9d232425285992d`, `publicArtifactDigest` `b142e79f055fdf6a2af863a9b344bf4eb4257d5b97bac02ffeefc2ff7251232b`, `rightsDigest` `efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550`.

```sh
umask 077
node prepare-accepted-work.mjs --task-id market-REPLACE --terms-digest REPLACE --artifact-digest REPLACE --expected-revision REPLACE --summary-file query-key-summary.txt --artifact-file query-key-seed.json --rights-file query-key-rights.json --consent-file consent.json --out permit-requester.json
```

3. Requester permit. Expected: `ok` true, `acceptedWorkVisible` false, `paidWork` false. Anonymous `discover-accepted` still has no item for this task. `detail` for this task is `not_found`.

```sh
node accepted-work.mjs permit --origin https://samedaydesk.com --secret-file requester.secret --input permit-requester.json > permit-requester-result.json
```

4. Prepare the contributor permit with the revision from that result and the same task, terms digest, artifact digest, summary, artifact, rights, and consent. Do not reuse `permit-requester.json`.

```sh
node prepare-accepted-work.mjs --task-id market-REPLACE --terms-digest REPLACE --artifact-digest REPLACE --expected-revision REPLACE --summary-file query-key-summary.txt --artifact-file query-key-seed.json --rights-file query-key-rights.json --consent-file consent.json --out permit-contributor.json
node accepted-work.mjs permit --origin https://samedaydesk.com --secret-file contributor.secret --input permit-contributor.json
```

Expected contributor result: `ok` true, `acceptedWorkVisible` true, `paidWork` false. That second permit is the publication. There is no separate publish POST.

5. Anonymous readback. No secret file. These are not Root writes.

```sh
node accepted-work.mjs discover-accepted --origin https://samedaydesk.com
node accepted-work.mjs detail --origin https://samedaydesk.com --task-id market-REPLACE
node accepted-work.mjs artifact --origin https://samedaydesk.com --task-id market-REPLACE > artifact.json
```

Expected list: 200, `items` contains the task, `summary` equals the summary file, `publicArtifact` omitted, `publicReads` `0`, `paidWork` false. Expected detail: the same summary, artifact body omitted. Expected artifact body: `value.publicArtifact` equals `query-key-seed.json` and `publicArtifactDigest` is `b142e79f055fdf6a2af863a9b344bf4eb4257d5b97bac02ffeefc2ff7251232b`. If a permit exits 2 with `unknown_outcome`, do not POST again. Run `accepted-work.mjs readback --operation permitAcceptedWork` with that party's existing secret file.

## Downstream consumer

The concrete consumer is `tools/n4-compat-transfer/compare_query_key.py` at neomorphic-io `d5ef2a20092aafa77a178b0ff4e8526fd25022d3`. It is the Starlette copy-in B1 measured at 86 ms on `adapt-tray.json`, with `x402` unloaded. Its file sha256 at that commit was not recomputed here and is unknown. The next-use command, after the anonymous artifact matches `query-key-seed.json`, is:

```sh
PYTHONPATH=/path/to/py python3 tools/n4-compat-transfer/compare_query_key.py \
  --input callers/trailing-space-key.json \
  --before /path/to/f0b3e89463d4b291cab95830151c4c1c05ff04b6 \
  --middle /path/to/164d9e30abf5cd8aa3c2eaae617c71a115b24fbe \
  --after /path/to/9cdf0e470a232c2a9779c88f080a2aeb1e76a664
```

B1 reported that input as old true, middle true, current false, status 200 then 409. This packet did not re-execute the three pins. Repeat the same command with `callers/direct-lot.json` for the bare-versus-blank class. A null collision boolean means the checkouts were not executed.

## Test

Command: `node --test --test-concurrency=1 docs/receiving/n4-contrib-readiness-20261104/seed.test.mjs`

Result: 2 tests, 2 pass, 0 fail, 0 skipped. Duration about 185 ms. The first test checks the seed, the direct-lot alignment, and `proposalFrom`. The second test adds one string and expects `publication_refused`. No live write. Not outside use.

## Unknowns at this packet

- Keyway locator strings for the enrolled accounts.
- Whether a private accepted task already exists.
- 9cdf0e47 equality for the six retained v2 cases.
- sha256 of `compare_query_key.py` at `d5ef2a20`.
- The archive body was not downloaded again this turn. B1 reports `pack` still emits `51b1b657`.
- Outside use, revenue, and a network effect were not observed. Unknown is not zero.

## Caller publication

Root permits `query-key-caller.json`. It is one `cc0.query-key-caller.v4` document, JSON-equal to B1 `inputs/direct-lot.json` at neomorphic-io `d5ef2a20092aafa77a178b0ff4e8526fd25022d3` and to `callers/direct-lot.json`. A value pair `lot#` = `row 3`, then key `seal` bare on the left and blank on the right, both on `GET /n4/direct/lot`. The file is the compact serialization, 304 bytes, file sha256 `c7f63611f4247f9a04c95b16aff4d94a322cfc149cd1d06ead75d9118d5c1424`. It has no license, rights, or provenance fields. Those stay in `query-key-rights.json`, `query-key-summary.txt`, and this file.

The 9-case `query-key-seed.json` still passes `proposalFrom` and still fails the normal caller. On the archive downloaded this turn, `node apply.mjs apply --artifact corpus.json --input query-key-seed.json` exited 1 with `{"ok": false, "code": "caller_refused"}`. `assertCorpus` still requires the exact 25-case bank. This packet does not squeeze that corpus into the publication object, and it does not change a limit.

### Fence run

Installed `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` `proposalFrom`, unchanged. Canonical JSON 304 bytes. String values 15. Limits stay 4096 bytes and 40 strings. A 41-string clone is `publication_refused`.

| Item | Value |
| --- | --- |
| Public artifact, foundation digest | `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3` |
| Summary, foundation digest, text unchanged, 102 bytes | `4f07cb0db1756b5a09f94b982bcce40e271e016b2fc0a922c9d232425285992d` |
| Rights, foundation digest, object unchanged | `efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550` |
| Proposal digest beside the installed canary evidence | `89323d2aa4681bb750f801b5ce48ece36513cfdbfc87b900007d682ddd751a92` |

Exit of that `proposalFrom` call: accepted, no throw. The local test asserts the same digests.

### Archive caller run

Downloaded `https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz` this turn. Status 200, 14566 bytes, sha256 `51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa`. Extracted unchanged. `apply.mjs` file sha256 `7e2618f2d4129af7a8a78338863b2ee7741fadf67f9161c5c18d1820f3a6f7d1`. `execute.py` file sha256 `824f8c47b727c302ac95b80cc2ad523ff46a637309ac41abb733374bcc0e5031`. `corpus.json` file sha256 `060c8aa08ca58c665f1b610d4cccbb9800a53f16f242d2f22bed496dd6c201d6`.

The input was `query-key-caller.json`. A retrieval round trip (parse, place on `value.publicArtifact`, stringify the response, extract, stringify again) writes the same 304 bytes and the same sha256 `c7f63611f4247f9a04c95b16aff4d94a322cfc149cd1d06ead75d9118d5c1424`. Complete stdout is `caller-runs.txt`: the 9-case input exits 1, and the caller exits 0 for both the key run and the mount run. Pins are clean checkouts of `https://github.com/dhyabi2/x402-nano-exact` at `f0b3e89463d4b291cab95830151c4c1c05ff04b6`, `164d9e30abf5cd8aa3c2eaae617c71a115b24fbe`, and `9cdf0e470a232c2a9779c88f080a2aeb1e76a664`. Local `PYTHONPATH` had fastapi 0.162.0, starlette 1.10.0, and uvicorn 0.54.0. No live host write. No wallet call.

Key execution, exit 0:

```json
{"ok": true, "schema": "cc0.query-key-caller-run.v4", "executed": true, "actual": {"kind": "key-execution", "oldEqual": true, "midEqual": true, "nowEqual": false, "afterLeft": "{\"method\":\"GET\",\"path\":\"/n4/direct/lot\",\"query\":[[\"lot#\",\"row 3\"],[\"seal\",null]]}", "afterRight": "{\"method\":\"GET\",\"path\":\"/n4/direct/lot\",\"query\":[[\"lot#\",\"row 3\"],[\"seal\",\"\"]]}"}, "walletCalls": 0, "liveSettlement": false}
```

The full key-execution object also returned `beforeLeft` and `beforeRight` both `GET|/n4/direct/lot|query:lot#=row 3&seal=`, and the middle pin both `{"method":"GET","path":"/n4/direct/lot","query":[["lot#","row 3"],["seal",""]]}`. Before and middle parse both forms of `seal` as an empty string. The current pin parses bare `seal` as null and blank `seal` as an empty string.

Mount on the same bytes, exit 0. Before and middle: status 200 then 200, replayed false then true. Current: status 200 then 409, replayed false then false. The 409 body is `{"error": "payment already consumed by another request"}`. `loopback` is `127.0.0.1`. `signer` is false. `walletCalls` is 0.

### Commands 2 to 5

No signup. Secret files stay the existing `requester.secret` and `contributor.secret`. Keyway locator strings remain unknown. Custody path named in the read inputs: `/home/ubuntu/root97253-first-party-accounts`. These writes were not run.

2. Prepare the requester permit. Expected: `posted` false, `publicationConsent` true, `summaryDigest` `4f07cb0db1756b5a09f94b982bcce40e271e016b2fc0a922c9d232425285992d`, `publicArtifactDigest` `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`, `rightsDigest` `efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550`.

```sh
umask 077
node prepare-accepted-work.mjs --task-id market-REPLACE --terms-digest REPLACE --artifact-digest REPLACE --expected-revision REPLACE --summary-file query-key-summary.txt --artifact-file query-key-caller.json --rights-file query-key-rights.json --consent-file consent.json --out permit-requester.json
```

3. Requester permit. Expected: `ok` true, `acceptedWorkVisible` false, `paidWork` false. Anonymous detail for this task is `not_found`.

```sh
node accepted-work.mjs permit --origin https://samedaydesk.com --secret-file requester.secret --input permit-requester.json > permit-requester-result.json
```

4. Contributor permit with the returned revision. Do not reuse `permit-requester.json`. Expected: `ok` true, `acceptedWorkVisible` true, `paidWork` false. That second permit is the publication.

```sh
node prepare-accepted-work.mjs --task-id market-REPLACE --terms-digest REPLACE --artifact-digest REPLACE --expected-revision REPLACE --summary-file query-key-summary.txt --artifact-file query-key-caller.json --rights-file query-key-rights.json --consent-file consent.json --out permit-contributor.json
node accepted-work.mjs permit --origin https://samedaydesk.com --secret-file contributor.secret --input permit-contributor.json
```

5. Anonymous readback. No secret file.

```sh
node accepted-work.mjs discover-accepted --origin https://samedaydesk.com
node accepted-work.mjs detail --origin https://samedaydesk.com --task-id market-REPLACE
node accepted-work.mjs artifact --origin https://samedaydesk.com --task-id market-REPLACE > artifact.json
```

Expected list: 200, the task is present, `summary` equals the 102-byte summary file, `publicArtifact` omitted, `publicReads` `0`, `paidWork` false. Expected detail: the same summary, artifact body omitted. Expected artifact: `value.publicArtifact` equals `query-key-caller.json` and `publicArtifactDigest` is `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`. A lost permit is exit 2 `unknown_outcome`. Read back. Do not POST again.

The private `artifactDigest` is Root's delivery receipt. It is unknown until that receipt exists. It must differ from `1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3`.

### Next use of the retrieved artifact

From the extracted archive, on the artifact file saved from `value.publicArtifact`:

```sh
node apply.mjs apply --artifact corpus.json --input retrieved-public-artifact.json \
  --before /path/to/f0b3e89463d4b291cab95830151c4c1c05ff04b6 \
  --middle /path/to/164d9e30abf5cd8aa3c2eaae617c71a115b24fbe \
  --after /path/to/9cdf0e470a232c2a9779c88f080a2aeb1e76a664 \
  --mount
```

Expected: exit 0, `oldEqual` true, `midEqual` true, `nowEqual` false, before and middle 200 then 200 with replay, current 200 then 409 without replay.

### Test

`node --test --test-concurrency=1 docs/receiving/n4-contrib-readiness-20261104/seed.test.mjs`

2 tests, 2 pass, 0 fail, 0 skipped. The first checks the caller bytes, the digests, and `proposalFrom`. The second adds strings until 41 and expects `publication_refused`.

### Unknown at this caller publication

- Keyway locator strings.
- Whether a private accepted task already exists.
- Profile and accepted-work list were not read again this turn. The 22:58:37Z hashes stand until a later GET.
- sha256 of `compare_query_key.py` at `d5ef2a20`.
- Outside use and revenue were not observed. Unknown is not zero.
