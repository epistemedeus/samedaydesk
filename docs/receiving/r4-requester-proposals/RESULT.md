# ROOT4432 / R4-J01 requester proposal review

Completed source receiving on October 23, 2026, in the admitted Cursor VM. Adds
`POST /api/neomorphic-contributor-journey/v1/market/interests` through the existing
machine dispatcher. It returns the task requester's current proposal notes from
`ae14_market_interests`, with no new store or business mutation.

The dispatcher retains current cookie-session, origin and CSRF checks. The read
rechecks account membership/role and the stored task requester in the configured
tenant. Its read-only repeatable-read transaction returns exact stored `note`,
`contributorId` and `taskId`. Default page size is 20, maximum 50; notes are at most
4096 UTF-8 bytes, including at the database read boundary. Oversized historical
rows refuse rather than truncate. Ordering is contributor ID under PostgreSQL
`C` collation. Canonical cursors bind tenant, requester, task and last contributor;
they are positions, not access authority. Each page observes current rows, so a
fresh first page is needed to include new contributors before a prior cursor.
No stored creation/update clocks exist, and none are invented.

The profile advertises the read additively. The immutable cold 0.2.0 script and
its exact `mutationReceipts` contract remain unchanged. The read returns before
the generic transition writer and never selects, assents, reserves or funds work.

## Inputs and identity

- Canonical origin: `https://github.com/epistemedeus/samedaydesk.git`.
- Admitted branch: `codex/root4432-requester-proposals-20261023`.
- Installed base: `79fbd37d31aabdc790248443c576a2f0017e55f0`, tree
  `9e7c8c1bb1f513841117d9d7d3bd5ef49839f501`.
- Operating/assignment input: Pilot `8aded3ca3bb5f22b32454f962091ef3750715a76`;
  receipt SHA256 `46f5b146c7d8ace06b78bcfcb764a6b5e989aea0de5e02ccbd87eb58e09f273a`.
  Read the staged AGENTS, STATE, execution plan and ROOT4430 assignment.
- Exact brief/research: Pilot `75654b3ae7d959ceeddcb240fb2cddc7844b8653`,
  `overview/research/phase-20261023/product-journey-reserve/`: RESULT, PACKAGES,
  SOURCE-TABLE, LIMITS and relevant pinned market/HTTP evidence. Primary source
  is the installed vendored graph, not historical Pilot market source.
- SPEC identity: `ROOT-SOL-ROOT4432-261023`, admitted `gpt-6.1-sol` / `xhigh`,
  zero model children, 2,097,152 KiB total reserve. No other job was owned.
- Actual checkpoint `2026-10-23T13:31:23.085Z`; horizon
  `2026-10-23T13:46:23.085Z`. This export completes before the checkpoint.
- Exact source commit/tree and tested file hashes: [EXPORT.json](EXPORT.json).

## Receiving and retained attempts

All product receiving used real `createSdsApp`, loopback verified HTTPS and
owned disposable PostgreSQL 16.15 with server verification (`sslmode=verify-full`).
No production account/data, signing, RPC mutation, funding or installation was used.
The local RPC fixture supplies only startup chain/metadata reads.

| Evidence | Actual result |
| --- | --- |
| [01](01-prerequisite-failure.tap) | First command stopped at missing `pg`; no product test ran. |
| [02](02-npm-ci.log), [03](03-npm-ci.log), [04](04-apt-index.log) | `/usr/bin/time` was absent; shell-timed `npm ci --ignore-scripts --no-audit --no-fund` installed the locked dependencies. Apt indexes used only owned `/tmp/root4432-prerequisites`; the system's PostgreSQL binaries became available without this job installing or starting a shared service. |
| [05](05-existing-baseline.tap) | Existing ROOT410 receiver: 17/17 on untouched installed source. |
| [06](06-proposal-gap-baseline.tap), [07](07-proposal-receiving.tap) | New fixture first failed on an unquoted database identifier containing `-`; these runs did not reach HTTP. Fixed its identifier and early cleanup, and stopped only the two owned clusters identified from the failing test sockets. |
| [08](08-source-closure-refusal.txt) | Source guard correctly refuses amended source against the original shared pin (`binding_stale`). Captured diagnostic repeat; the subsequent chained test was not run. |
| [09](09-proposal-gap-baseline.tap) | Corrected new receiver on a disposable archive of the exact base: existing task read exposes the interest actor/digest but no current note; proposed reader returns 404. Two baseline assertions pass, reproducing the acceptance gap. |
| [10](10-proposal-receiving.tap), [11](11-proposal-final.tap) | Candidate proposal receiver: 11/11. Final adds current task-owner revocation, active finite diagnostic-log privacy and resource sampling. |
| [12](12-existing-requester-final.tap) | Existing ROOT410 receiver: 17/17 on candidate closure. |
| [13](13-existing-receipts-final.tap), [14](14-existing-receipts-baseline.tap) | Extra ROOT425 receiver stops before cases with `runtime_schema_unready` on both candidate and untouched base. Its fixture installs @010 then renames the earned schema, leaving the function's literal schema references stale. |
| [15](15-existing-receipts-fixture-corrected.tap) | In a disposable copy only, reapplying the existing schema loader with the selected schema after rename receives all 21/21 ROOT425 checks. [Exact two-line fixture correction](root425-fixture.patch) is proposed for Root; no guard or source requirement is weakened. |

The 11 proposal checks receive: unchanged cold-script lost post/interest readback;
requester reads actual notes without contributor credentials; current updates
with original receipts preserved; two-contributor pagination; empty/final/full
pages; maximum/oversized notes and page limits; foreign requester/tenant/task,
forged identity, missing CSRF/origin, anonymous/expired/revoked session and removed
membership/changed role/current task owner refusal; hostile markup, Unicode and
control bytes as JSON; no proposal contents in measures/profile/task read or
active finite diagnostic logs; lost-read retry; restart, login and recovery
without re-submitting interest or creating a replacement account.

Every proposal read/refusal compares hashes of every row in the earned-work,
hosted-market and guard schemas. Original seeded terms, earned debt, payout
state, receipts, interests, financial rows and funding flags are preserved by the
reads. All tests ran serially with a 512 MiB Node heap cap inherited by child
CLI processes. Final sampled summed RSS for the owned Node runner/CLI plus PG
was 560,188 KiB (shared PG pages may be counted repeatedly); this excludes the
native controller. Its separately observed RSS was 216,744 KiB. These are scoped
observations, not a claim to measure the peak of the whole VM.

## Self-review and next use

Reviewed the dispatcher early return, parameterized tenant/task query, actual
membership and requester authorization, bounded canonical cursor, exact byte
preservation, current-note update semantics, transaction read-only setting,
profile compatibility, source guard and unchanged financial producers. Fixed
ordinary fixture findings in this branch. Syntax and `git diff --check` pass.
No new dependency, migration, client, account authority or financial port is needed.

Install locked dependencies once, provide PostgreSQL 16 binaries and OpenSSL,
then run serially from the admitted checkout:

```sh
bash docs/receiving/r4-requester-proposals/receive.sh baseline
bash docs/receiving/r4-requester-proposals/receive.sh candidate
bash docs/receiving/r4-requester-proposals/receive.sh candidate server/scripts/test-root410-requester-receiving.mjs
bash docs/receiving/r4-requester-proposals/receive.sh candidate server/scripts/test-root425-cold-mutation.mjs root425-fixture
```

The recipe archives exact source into an owned temporary copy, overlays only
R4-J01 files, and uses the existing source-closure producer there. It deletes the
copy on exit. The writer branch's `SOURCE.json`, runtime contract, private pin,
root manifests/locks and all sibling implementation files remain unchanged.
Candidate closure identity is retained in logs 13/15 with `qualified:false` and
`installed:false`. Root must regenerate the combined canonical closure through
the existing producer and receive it before any release; this branch intentionally
cannot use the old installed pin to admit amended source.

For an existing requester session, use the same-session HTTP primitive with
origin, cookie and `x-cj-csrf` headers; no idempotency key is needed:

```json
{"taskId":"market-<existing-task-id>","limit":20}
```

The existing envelope contains `value.result`:

```json
{"taskId":"market-<existing-task-id>","items":[{"taskId":"market-<existing-task-id>","contributorId":"<stored-account-id>","note":"<exact current proposal>"}],"nextCursor":null}
```

Pass a non-null `nextCursor` as `cursor` for the next page. Treat notes as
untrusted data. The concrete remaining boundary is Root's shared closure,
composition and installed receiving. Source success establishes no outside use,
paid acceptance or revenue.
