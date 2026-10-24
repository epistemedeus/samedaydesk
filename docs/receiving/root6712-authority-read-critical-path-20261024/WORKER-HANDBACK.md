# ROOT6712 source handback

**SOURCE_OPTIMIZATION.** Wallet read transaction setup now sends its existing
three ordered statements in one PostgreSQL protocol call. The measured composed
accepted read falls from **54 to 52 query calls**, with **54 logical statements,
13 acquisitions/releases and one accepted-source invocation** on both versions.
This is a small source improvement. Neither the 6594 ms entitled read nor the
41564 ms original proof is attributed to SQL, and installed latency/business
acceptance is unreceived.

## Exact source and operating authority

- Repository/origin: `https://github.com/epistemedeus/samedaydesk.git`.
- Preserved branch: `codex/root6712-authority-read-critical-path-20261024`.
- Admitted base/parent: `d310f4cf37fb190d850ac0cea71ec34787972162`, tree
  `8b79c1d8586c630f90a5241f52ce969fda641466`.
- Tested source head: `95b8cc3ec303558db30c6cb9f62cf1d91b9f1061`, tree
  `98d5e14b6b9848c04ac444817a8cb03c467e2312`, sole parent the admitted base.
  That source commit is clean-pushed and remotely read back at the identical
  head (`source-push.json`). The commit containing this handback only adds
  receiving documentation; resolve its export head/tree/parent with Git.
- Pilot operating/assignment pin: `a75a402253771cb64f408f7163cade2111932b54`.
  The entire supplied AGENTS/STATE/plan/assignment was read before source work;
  all four SHA256 values equal RECEIPT.json. Receipt SHA256:
  `88a2b1eb6caa23caa2b67b5bd246ecd6ff7a15c7dae8de836460a413612c0baa`.
- Actual native RUN/admission profile: `gpt-6.1-sol`, `xhigh`, one parent,
  zero model children. Completed-turn terminal collection belongs to the
  admission supervisor after return, not an assertion made while still running.
- Own SPEC checkpoint: `2026-10-25T00:26:54.995Z`; requiredUntil:
  `2026-10-25T00:41:54.995Z`. Source export completes before that checkpoint.

Dedup was rechecked against the frozen current-owner/accepted-source records,
local tracking refs/history and actual reservation registry. Its other active
ROOT6696 reservation is independent Pilot close-fixture receiving. ROOT1208's
accepted lifetime work and 816124b4's test-only SQL-latency receiving are already
baseline, not this setup batching. No covering SDS server-query owner or exact
accepted batching repair appears in the admitted evidence. No later ref move is
used as a new admission; no other job or claim is taken over.

## Causal map and correction

`createSdsApp` mounts wallet handling before contributor routes. Wallet requests
pass `contributor.guardRequest`: managed readiness, exact host/origin and secure
ingress checks. The new fixture uses actual managed composition over direct
verified loopback TLS, the frozen Neo427f runtime, and verify-full disposable PG.
It supplies no alternate service/port/adapter implementation.

The full wire GET `/v1/review?taskId=...&reservationId=...` enters the existing
bounded review slot, acquires one wallet pool connection, starts READ ONLY,
sets transaction-local earned schema and 2500 ms statement timeout, authenticates
the fresh session and delivery binding, then resolves reservation/work/account
and requester links. For opportunity work it calls the app's **unchanged**
`readAcceptedSource`: await contributor readiness, require the actual installed
runtime, call `installed.adapters.review.read(target)`.

That compiled adapter loads the canonical claim/round/offer/submission/obligation,
checks terms and principal/account binding, reads frozen report bytes, validates
the bound correspondence project/grant/bootstrap and signed verdict history,
and checks the owed obligation. The wallet joins the current disposition and
returns the entitled result only after COMMIT. Paid disposition readers still
perform their existing source/enrollment, stored-debt, registry/MAC/receipt and
chain checks; those checks and possible-spend/unknown quarantine are untouched.

Only `withReadClient`'s three parameter-free setup calls change. The earned schema
already passes the owning identifier validation. Statement order, transaction
scope, read committed isolation, timeout values, cancellation, rollback and
release remain unchanged. There is no new cache, request, retry or parallel fanout.
Post-write rereads and per-request accepted-source reuse remain as before.

## Measured receiving

Final paired data: `baseline-received.json` / `baseline-export.tap` and
`corrected-export.json` / `corrected-export.tap`; derived `comparison.json`.
The same receiver SHA256 is recorded on both. Each run makes six independent
measured GETs: one after normal 11-second idle eviction, two warm no-delay reads,
then three warm reads with 5 ms added immediately before each query call.
Measurements use monotonic server request-entry-to-finish clocks; HTTP TLS
handshake/client time is outside that clock. Delay is fixture-only and is not
an estimate of deployed network delay.

| Measurement | d310 baseline | Corrected |
| --- | ---: | ---: |
| Query calls per accepted read | 54 | 52 |
| Logical read SQL statements | 54 | 54 |
| Wallet setup calls | 3 | 1 |
| Wallet / compiled callback calls | 16 / 38 | 14 / 38 |
| Acquisitions and releases | 13 / 13 | 13 / 13 |
| Cold physical connections / warm | 4 / 0 | 4 / 0 |
| Accepted-source calls per GET | 1 | 1 |
| Staging app startup calls / acquisitions / connections | 87 / 14 / 4 | 87 / 14 / 4 |
| Startup ms | 191.735 | 228.205 |
| Idle-cold read ms | 53.495 | 56.275 |
| Warm no-delay read ms | 17.791, 16.210 | 22.257, 15.095 |
| 5 ms-delay read ms | 324.549, 319.265, 311.125 | 304.355, 306.977, 305.994 |
| 5 ms-delay median ms | 319.265 | 305.994 |

The causal reduction is two protocol calls. No reliable no-delay latency gain
is established by these small noisy samples. Per-stage monotonic query events,
acquisition durations and response-close times are retained without SQL text,
parameters, origins, actor IDs, report bodies or credentials. Startup contains
migration scripts; its SQL statement count is intentionally not asserted.

Within each run all six authorized outputs are deep-equal. For comparison across
independent fixtures, only random reservation/obligation/verdict identities are
replaced with labels; all other returned fields contribute to the identical
SHA256 `b1312b3d3a809be3fa1f614e0054713620be21f2c0f345eb0915e17f04bfe080`.

Final corrected commands report **108 passed, 0 failed/skipped/cancelled**:
10 new composed checks, 47 wallet/authority/component-mount checks, and 51 cases
across the four mounted wallet/requester files. Node totals include parent test
containers. The separate exact-base comparison passes 10/10; repeated intermediate
runs are not added to 108. Exact commands are in `COMMANDS.md`; all runs/exits,
first failures, log hashes and cleanup trailers are in `RUNS.json`.

The composed fixture has **28 read actions: 9 positive, 10 failure/disconnect,
9 recovery** on each version. Actual statuses: 18×200, 2×401, 2×404, 3×503,
1×500, 1×409 and one disconnected/no-response action. It checks fresh session
revocation/restoration, foreign actor, acquisition/setup/session errors, actual
settings, SQL error after partial setup with rollback, changed terms/principal,
concurrent revocation before auth, cancellation during setup and a fresh success.
Two additional wrong report/debt writes are refused by immutable-store guards.
All row hashes across its 64 authoritative fixture tables remain equal.

The wallet lifetime receiver additionally exercises six wrong current-receipt
joins (amount, artifact digest, terms, task, claim, source), each refusing 409
and recovering to the identical paid output. Two new subtests remove original
enrollment keys or stored outcomes, observe 409 without a value, restore exact
rows and recover. Existing cases retain unknown/possible-spend, late acquisition,
query/close lifetimes, paid/owed, original key/body/outcome replay, foreign tenant,
lost response, process crashes and PostgreSQL WAL recovery coverage.

First failures are retained: absent selected round; a wallet cookie used for
native setup; omitted explicit terms acceptance; a callback-incompatible probe;
and immutable-write/non-exported-status fixture assumptions. These were fixture
repairs before/following baseline work, not five product defects. The original
failed results and the early isolated Pulse scratch residue remain in their
logs; that exact owned residue was subsequently removed. Self-review also fixed
one inherited tiny refusal child that dropped heap/thread settings when stripping
its environment. The final 47-case wallet run includes that correction.

## Closure, preservation, cleanup and next owner

The owning raw-source exporter changes one installed-source digest and the
server/SOURCE entries of the existing host pin: 112 package members and 1302 host
members, with unchanged membership. `closure.json` records source digest
`31bc9c5d15764b266bd331df0682374fbbcf8e89fbe6335705b947c3b0e18a8d`
and host digest `db76819c7ccd710a30657423aa8844c532660361c2734aab2d65642578351dc5`.
Both qualification and installation remain false.

`preservation.json` receives unchanged 414 client, 444 compiled Neo and 46 desk
members, with no new protected files. No human assets were built or published;
unchanged source is not a new emitted/hosted-human receiving claim. Financial,
terms, debt, authority, archive and signing runtime code remain unchanged. Only
synthetic fixture accounts, reports, keys, signing and loopback services ran.
There was no private live endpoint/store/journal/credential/provider/wallet access,
production effect, PR, merge or release. The enrolled native Git source branch
is the only remote mutation.

Node is 22.23.3, PG 16.15 and Python 3.12.3. Dependencies reuse the received
root4433 install with an equal root lockfile; no installation/lock change occurs.
Final helpers enforce 512 MiB Node heaps (384 MiB existing crash child), UV/OMP=1,
serial PG/TLS and subreaping. Maximum sampled owner/test/PG summed RSS is
990,912 KiB against the single 2,097,152 KiB total reserve. Final baseline and
corrected commands each start/stop/reap one PG daemon, wallet command two, and
mounted command five generations (four clusters plus one explicit immediate-stop
WAL restart); all pairs close and all trailers show no owned PIDs/scratch.
The dependency symlink and archive scratch are removed. The native admission
claim stays with its existing supervisor until terminal collection; the worker
neither releases a running parent's reserve nor alters foreign claims.

The remaining **38 calls / 12 acquisitions** in the callback are inside the
frozen Neo427f closure, including 12 settings and seven BEGIN/COMMIT pairs.
A larger optimization needs a separately admitted **Neo TypeScript source owner**
at `https://github.com/epistemedeus/neomorphic-io.git@427f5a08e3b294a8f15fb9d148f7de46ca7cb538`:
`services/contributor-journey/opportunity-adapters.ts` (`load`, `review.read`,
`history`), `composition-store.ts` (`accountForPrincipal`, `round`, `project`,
`requireBoundProject`), `services/earned-work/src/store/postgres.ts`
(`connectScoped`, `withTx`, `withOpportunityClient`), correspondence store query
setup and submission persistence `load/tx`. Source maps identify those upstream
files. This package does not edit compiled bytes. Live-profile and mediated
external-report branches can add authority reads; their full installed timing,
SQL/network attribution and safe upstream reuse remain unproved.

Root next owns independent source receiving, package/consumer qualification,
any installed release and actual accepted-consumer/business receiving.
