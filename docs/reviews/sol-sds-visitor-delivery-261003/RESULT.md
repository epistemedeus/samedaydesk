# SameDayDesk visitor delivery receiving — 2026-10-03

Merge-ready source integration on `codex/sol-sds-visitor-delivery-261003`, based
exactly on current main `1f333f33e088ffd466f8ce13fb7202e8d4e6d0b5`.
The final combined receiving run at executable integration checkpoint
`02b514cf1c47a1d690670029c5c84c7024a9e4cb` passed **471/471 tests**, zero failures,
skips or cancellations. Site build and actual production-mode `server/index.js`
loopback readback pass. This is source receiving; production enrollment,
deployment and outside usefulness remain separate conditions.

## Received source and changes

| Input | Pin / handling |
| --- | --- |
| Sol379 | `19bf598369de000a3dd78ff2401f9e3cc957e662`; reviewed runtime delta, applied Express mount, minimal client, owning recipe/reuse fixes and tests ported selectively |
| Sol384 | `eb5d95f4f5d3d63c2c815151ac2891181bb96bc5`; licensed caller closure and tests received; its unapplied machine-entry patch applied to existing task catalog/generator |
| Current EIN backend fixture | `9b71db2a00b96f1b2ffa8165d1e19cd0e0edfc42`; isolated Git archive with owning `pnpm@11.25.0` frozen-lock dependencies; original repository and credentials untouched |
| Canonical VF | `1652533b1823ac33b86591ec4e931a8c4ea4aa97`; original correspondence/work-cell adapters and receipts retained |
| Current private Pilot | `a5626187004849a5f1fb8309a288d76b2097deb2`; current STATE and `overview/DELIVERY-TO-DEMAND-IMPLEMENTATION-20261002.md` read; no historical fanout imported |

No ancestral branch histories were merged. The new mount precedes the global
JSON parser and closes through the existing listener lifecycle. Public supplied
evaluation remains separate from project-grant-bound retained execution. There
is no replacement store, ledger, signer, queue or inference fallback.

Receiving reproduced and repaired two defects with direct regressions:

- A corrected canonical checkpoint could still feed a later admission. Reuse
  now checks the current checkpoint, digest and state; retains its dependency
  reference; rechecks before physical execution and result commit; and refuses
  retrieval/export/reuse of completed dependent results after correction.
  The existing 128-job capacity also bounds dependency traversal. Actual
  canonical cancellation preserves the result receipt while withdrawing access.
- Frozen EIN 0.1.3 reconciles `async_pending` as paid. The SDS caller derives
  returned payment/completion from the actual application state, so pending is
  unpaid and incomplete. Its private EIN journal retains the historical flag;
  it is not paid evidence. Changed caller bytes are sealed as **caller 0.1.1**,
  while acquired EIN 0.1.3 and caller 0.1.0 stay frozen.

Sol384 tests now use the full production SDS Express app and generated static
machine assets, rather than a test-only catalog/router. Actual current EIN
handlers run through their existing disposable receiving backend. No real
application, customer, payment or participation record was created.

The readiness inventory failure was reproduced on untouched main: 126 pass,
one fail. The repaired test verifies the real MCP inventory and existing
discovery links, without requiring literal tool names in restored human copy.
All 659 protected client, canonical-vendor and foundry files compare unchanged
against main; frozen received archives also compare byte-for-byte.
See [PRESERVATION.json](PRESERVATION.json).

## Verification and artifacts

| Final checks | Passed |
| --- | ---: |
| Mounted hosted journey / real PG / stripped callers / correction / expiry | 38 |
| Caller composition / export / actual current EIN, four transports | 19 |
| Agent readiness | 127 |
| L08 / public readiness | 28 |
| Existing backend / startup / MCP / correspondence / foundry / real processes | 100 |
| Recipes / all result-reuse tests / public entry / predecessor integration | 154 |
| Offline public-copy / immutable archive controls | 5 |
| **Single combined run: 61 files, 109.060 seconds** | **471** |

[TESTS.json](TESTS.json) contains exact commands, pins, counts and log hashes.
`final-combined.tap.gz` and the four baseline/regression failure logs preserve
actual output. The missing merchant dependency reproduced four failures and one
skip on unchanged base; supplying its declared local checkout at pinned
`015f07d5a75d02a4e74709b17b2b1176501e92a5` resolved them without changing tests.
Initial per-package EIN `npm ci` refused the absent package lock; receiving used
its declared pnpm workspace lock instead. No dependency versions were amended.

Tests exercise two stripped acquired-client processes with distinct supplied
tasks, usable positive output and a missing-field negative, then a later caller
retrieves the same digest after real OS process loss. Additional checks cover
changed later input, concurrency, same-key replay, commit-before-lost-reply,
unknown execution reservation, cancellation, actual deadline/lease/grant expiry,
current authority revocation/correction and atomic receipt/checkpoint/release.
The server never substitutes an example or default goal for required caller
inputs. Intake, HTTP reads, PG setup, execution and owned child groups share
bounded deadlines and byte accounting.

| Archive | Exact identity |
| --- | --- |
| Hosted-useful client 0.1.1, unchanged | 10,377 B; SHA256 `84cbb35758e8466cf36dd99d804b0b4c09251b9dc4c2820239c98568b494323d`; source `fa4cac94758ba8d35189d09ef685130f8db5d83a` |
| Acquired EIN 0.1.3, unchanged | 48,615 B / 39 members; SHA256 `1273c33e77aadef2eececd1d1c7269ef9c9205558c223adb2982e7517d523ad2`; fresh public archive and every member verified |
| Original caller 0.1.0, unchanged | 67,835 B / 59 files; SHA256 `1ebdb38651dbae3262d8d5306ae35f4fb8bd3c2cf3cbea167c41834e3da7a781` |
| Caller successor 0.1.1 | 68,369 B / 59 files; SHA256 `994ffe92d532c309a1f0b99f20ffcffc6a0c01846f44054f782c0f3ff7744c5b`; executable closure sealed to `b529cf9266d63c4c0a0408d402ead2570022a50a` |

The existing useful-jobs generator links the hosted journey. The existing task
catalog generator links `/for-agents/relevant-activation/relevant-activation-caller-0.1.1.tgz`.
No second catalog or human page was introduced. Source/archive sealing refuses
a historical pin that lacks the actual caller closure.

## Actual hosting and remaining conditions

[PRODUCTION-READBACK.json](PRODUCTION-READBACK.json) records anonymous reads:
correspondence is `enabled:false`, `reason:unconfigured`; visitor entry is 503;
hosted-useful recipes/health/client and caller 0.1.1 archive are 404. Public
readiness works. Public offline 1.4.7 is acquired at 5,255,824 B / SHA256
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`.

[STARTUP-READBACK.json](STARTUP-READBACK.json) separately proves the built site,
existing MCP inventory/uploads refusal, generated discovery, exact client and
caller successor bytes, supplied evaluation and clean SIGTERM on loopback.
[EIN-READBACK.json](EIN-READBACK.json) and the caller's actual public-readback
evidence verify live HTTP/MCP/A2A/A2A-REST discovery. EIN publication flags remain
false despite available immutable bytes. Free supplied readiness/repair/recheck
is owner QA; formation assess/prepare/claim/payment were not run on production.

Root must resolve the existing authorized correspondence PG connection and
private profiles, run the owning installer and deploy through the existing
Hostinger Node22 app. Product Supabase HTTP settings are not PG credentials.
[ROOT-INSTALL.md](ROOT-INSTALL.md) gives the exact packet and receipt-preserving
rollback. No infrastructure was provisioned, spend authorized, production
configuration changed, merge/deployment performed or invitation sent.

Adopting a later EIN client requires an immutable successor pinned to Root's
separately received current-price/pending-payment repair, whose status
reconciliation excludes `async_pending` from paid. Verify its exact public
archive/member identity and rerun the four transports, pending/claimed states,
lost reply and current status-grant tests before replacing 0.1.3. No successor
identity is invented here; SDS caller 0.1.1 already returns correct pending facts.

Next visitor action today: acquire public offline 1.4.7 or use the existing free
supplied-readiness route with actual inputs. After publication/enrollment, acquire
the linked clients, run and retain a supplied task with an existing project grant.
Only a task with matching independently received operator/prerequisite records
gets the existing customer-held EIN continuation. Ambiguous, existing-business
and EIN-only cases retain useful no-purchase paths. Claim does not complete
formation. Outside usefulness, savings, demand, revenue and full/marginal costs
remain unknown.

Final report commit and remote feature-head readback are exported to the task's
`ROOT-EXPORT.json` and `RUN.json`. Native session
`01a10179-1fbd-7630-9557-dd00515939ba` is verified as Sol6.1/xhigh on this VM;
the existing task runner owns final usage/exit after this turn. No useful job was
stopped, resumed elsewhere or recreated.
