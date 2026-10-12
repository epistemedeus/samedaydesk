# RECEIPT — F01 S275 earned-work kernel transplant

## What shipped

`services/earned-work/` on `epistemedeus/neomorphic-io` branch `fable/f01-s275-kernel`.

HTTP + Postgres kernel: **reserve → claim → artifact → verdict → owed**, with `GET /v1/tasks/:taskId/payout` reconciling a **null, nonpaying** adapter. Artifact `ref` is metadata only (never fetched or executed). `payoutState=owed` is an IOU record, not paid and not settled.

## Pins

| Item | Value |
| --- | --- |
| Neo head at start | `45391e02fb97ee1eed0a050a12a94d540e9eb495` (`main`, PR37 on PR36 `411e53b1`) |
| Transport copied | `epistemedeus/pilot` `codex/s275-earned-work-kernel-20260911` `5de66179a551a76c7ea6be5a0de8a6918ca3c528` (`git rev-parse HEAD` on the attached Pilot checkout) |
| Copy tree | `services/earned-work/` only (not a branch merge) |
| Feature branch | `fable/f01-s275-kernel` |
| Cloud leftover name | environment started on `cursor/f01-s275-kernel-transplant-1cd0`; PR head is `fable/f01-s275-kernel` as specified |

`services/earned-work/` was **absent** on Neo `main`. Transplant, then adapt.

## Adaptations vs raw transport

- `GET /v1/tasks/:taskId/payout` + `null_nonpaying_v0` adapter (`paid: false`, `settled: false`, `transfer: null`).
- Immutable `correctionPolicy.maxRevisions` default 1 (second terms revision after the first correction is `correction_limit`).
- Optional `artifactDigestSha256` on verdict/accept; mismatch vs bound submission is `artifact_changed`.
- `scripts/pg-fixture.sh` falls back to local `initdb` when docker is missing.
- `scripts/fixture-journey.sh` starts Postgres + HTTP then the curl path.
- Root `package.json` script `test:earned-work`. Not added to root `npm test` / `check` (those stay static-site + correspondence memory tests).
- Honesty wrapper cites `packs/exchange-townsquare`, `packs/capability-preflight`, `packs/outside-operator-first-job`, `services/correspondence`. Does not copy those engines.

## Contradictions (brief vs current source)

1. Transport `DESIGN.md` create row says provenance `test\|production`; code, OpenAPI, and this brief also require `fixture`. Implemented `test \| fixture \| production`.
2. F01 journey asks for a reconciliation endpoint. Transport OpenAPI had obligation only (`transfer: null`). Added `/payout` rather than pretending obligation is settlement.
3. S276 proposed `amountAtomic`, `releaseReason`, product projection accepted/owed/paid/settled. Not implemented. S275 shapes stay honest: `owed` is not paid.
4. Correspondence default tests use an in-memory store. This kernel is Postgres-only (no mocked store pretending to be HTTP).
5. Cloud agent `ManagePullRequest` queued create for user approval; draft PR opened via GitHub as [#39](https://github.com/epistemedeus/neomorphic-io/pull/39) on `fable/f01-s275-kernel`.
6. Transport README mentioned Pilot banked USDC. Neo copy keeps the 0.10 USDC **hypothesis** and does not claim a banked rail.

## How verified

Node 22.14.0. Disposable Postgres via `./scripts/pg-fixture.sh` (local initdb on `127.0.0.1:55432`, user/db `earned_work` / `earned_work_test`). No docker.

```bash
export EARNED_WORK_DATABASE_URL=postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test
export EARNED_WORK_OWNER_TOKEN=dev-owner-token-s275
cd services/earned-work
npm ci
npm run build   # pass
npm test        # 30 pass, 0 fail
./scripts/fixture-journey.sh
```

### `npm test`

**PASS** — 30 tests, 0 fail. Covers the HTTP journey and seeded failures: replay/idempotency, duplicate submit, late submit (TTL and released), changed terms, changed artifact digest, malformed/oversize, permissions, oversubscribed funding, exclusive concurrent claim, persistence across store reopen.

### Curl journey

**PASS**

```
JOURNEY_RESULT=reserved→claimed→submitted→verified→owed
provenance=fixture
transfer=null
payout_adapter=null_nonpaying_v0
STEP payout=null/nonpaying owed≠paid≠settled
SEEDED_FAILURE=contributor-accept REJECTED status=401
```

## Known gaps

- No hosted deployment, no payment, no production tokens.
- Root `npm run check` does not run this suite (requires disposable Postgres). Use `npm run test:earned-work`.
- S276 verification pack is out of ownership; this kernel does not implement its extra projection fields.
- Contributor tokens are a local test helper (`POST /v1/contributor-tokens`). Not an identity provider.

## Secrets

None committed. `.env` is gitignored. Fixture owner token lives in `.env.example` as a local placeholder only.
