# H133010 opt-in accepted work

## Result

Anonymous discovery still excludes every voluntary row (`voluntary IS NULL`). A private export is an individual `grantVoluntary`. `machine-public-read` only records a discovery measure. The contributor-journey showcase is a separate one-party consent ledger and does not own this canonical market task, its terms, rights, artifact digests, or grant path, so it was not reused and no second ledger was added.

An accepted free task becomes anonymously readable only when both the requester and the contributor permit the same summary, optional public artifact, terms digest, rights digest, and artifact digest. The record lives in the existing `voluntary` JSON. Either party can withdraw the publication without deleting `ae14_market_voluntary_consumers`. A terms, rights, artifact, or summary mismatch hides every public route, including a later page, a cached read, and a restarted market process. Prior private grants keep their old terms.

`acceptedWorkPublic` defaults off. The production mount, CLI, and environment do not set it. `publicReads` stays `0`. There is no new table, hosted client version, human page, or live publication.

## Receiving

The mounted test drives `cold-requester-0.3.0.mjs` for signup, post, interest, offer, assent, delivery, review, grant, export, discover, and fund, and `client/accepted-work-source.mjs` for permit, publication withdrawal, anonymous list, detail, artifact, and readback. Both speak HTTPS to the mounted market on a disposable Postgres store.

The public list contained only the task both parties permitted. Its summary, summary digest, rights, and artifact bytes matched that permit. The detail omitted the artifact body. The artifact route returned the permitted object. Continuation links are the existing signup, interest, `grantVoluntary`, and `exportVoluntary` routes. The fresh visitor was refused export until `grantVoluntary`, then received the same evidence bytes as a direct grant on an unpublished twin. Open discover still listed the free task and none of the voluntary tasks.

Absent, one-sided, pending, and rejected rows were not listed. A stranger permit returned `forbidden`. A private voluntary row and another tenant's row were omitted, including when the private id sorted first. `<script>`, `USDC`, an account id, the private evidence object, a nested evidence string, a false `publicationConsent`, a caller source hash, and an extra `qa` field were refused without a revision bump. Flipping the stored artifact digest, or replacing the summary from only one side, returned 404 until both parties permitted the new summary.

The contributor permit response was destroyed after commit. The candidate exited `unknown_outcome`. Readback returned `acceptedWorkVisible: true` at the same revision and did not insert a second idempotency row. After withdrawal, a follow-up detail, a full list, and a stale cursor were empty. The visitor's private export still matched. Restarting the market host left the publication visible, and left it hidden after withdrawal. `withdrawVoluntary` on the twin removed that twin's grant only. The financial snapshot of quotes, funding, obligations, and grants was unchanged. `fund` from 0.3.0 stayed unpaid. With the option off, profile has no `acceptedWork`, the GET routes are 404, and 0.3.0 `act --action permitAcceptedWork` returns `participation_arguments_refused` before HTTP.

Accepted-work measures use `accepted_work_discovery`, `accepted_work_retrieval`, and `accepted_work_continuation`. They are not kind `discovery`, so they do not increase open-catalog impressions. Payloads are `externalUse: false`, `paidWork: false`, and `uniquePrincipal: null`, with no summary or account id. These rows are owner QA on a synthetic store. They are not outside use, paid work, revenue, adoption, or a network effect.

## Original failure

The first mounted run exited 1 at the lost-response status check. Client stdout was already `{"ok":false,"status":0,"code":"unknown_outcome","operation":"permitAcceptedWork","complete":false}`. Node 22 reports the child exit code on `error.code`. The harness read `error.status` and stored 1. The harness now uses `error.code`. The rerun exited 0. No product change was required for that failure.

## Commands and exits

```text
node --test --test-timeout=60000 vendor/hosted-wallet-market/test/accepted-work-publication.test.mjs
# exit 0, 5 passed
node --test --test-timeout=120000 vendor/hosted-wallet-market/test/root11380-public-participation.test.mjs
# exit 0, 17 passed
node --test --test-timeout=420000 server/scripts/test-h133010-accepted-work.mjs
# exit 0, 1 passed, duration_ms 11117
```

Base `b28b3c0024b885b7ea7ae672a978e11251ef71ca`. After the source-pin update, `installedSourceSha256` is `3448519b8044d8d85fd88ed0c6f2e3ed818615d0881bba82806b2e98827f7b7f` and `hostSourceSha256` is `f9a748c6faae74af92d07115d5d18714cf6ee4d7cc397e98afa87c0cd68cb3f1`. Those are this tree's admission hashes, not the installed H120 profile (`8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6` / `a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3`).

`cold-requester-0.3.0.mjs` sha256 remains `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4`. The diff does not touch human assets, guides, that client, `machine-public-read.mjs`, or `docs/machine-promotion`.

## Ordinary consumer commands

Immutable client: `signup`, `post`, `interest`, `inspect`, `act` (`offerVoluntary`, `assentVoluntary`, `deliverVoluntary`, `reviewVoluntary`, `grantVoluntary`, `withdrawVoluntary`), `export`, `discover`, `fund`.

Source candidate `vendor/hosted-wallet-market/client/accepted-work-source.mjs`: `permit`, `withdraw-publication`, `discover-accepted`, `detail`, `artifact`, `readback`. It copies source and host hashes from the live profile and refuses hashes supplied by the caller. It is not a new hosted release.

## File inventory

- `vendor/hosted-wallet-market/src/accepted-work-publication.mjs`
- `vendor/hosted-wallet-market/src/voluntary-market.mjs`
- `vendor/hosted-wallet-market/src/machine-market.mjs`
- `vendor/hosted-wallet-market/src/server.mjs`
- `vendor/hosted-wallet-market/src/public-route-limit.mjs`
- `vendor/hosted-wallet-market/client/accepted-work-source.mjs`
- `server/lib/hosted-wallet-market-mount.js`
- `server/scripts/root10940-machine-host.mjs`
- `server/foundry/activation/private-control-pin.json` (hash values of the five edited pinned files only)
- `vendor/hosted-wallet-market/test/accepted-work-publication.test.mjs`
- `server/scripts/test-h133010-accepted-work.mjs`
- `docs/reviews/h133010-opt-in-accepted-work/RESULT.md`
- `docs/reviews/h133010-opt-in-accepted-work/NEXT.md`
- `docs/reviews/h133010-opt-in-accepted-work/ACTIVATION.md`
