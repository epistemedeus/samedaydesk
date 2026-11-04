# H145010 RESULT

Durable observation of terminal `GET /api/tools/ai-readiness` results is on the existing pulse aggregate. The handler returns the same check body. A browser `tool_check_done` event is still rejected and is not execution evidence.

## Source

- Product: `epistemedeus/samedaydesk` base `3445fa1624e8d2a2cc06556cea45730687aa79d1`
- Branch: `codex/h145010-useful-tool-measurement-20261104`
- Worktree: `/home/ubuntu/ae14-work/h145010`
- Operating context: pilot `333e8fef89672f653b231cca4d4eb7c29633bd22`, assignment blob `b554bf94e09461d862191504bec1bcc994b59f99`
- H144 RESULT read at pilot `ecd4d6f051b0bc16bcdfd4f58a66b2d23cc2479e`. Its live three-call baseline was not repeated.
- Frozen checkpoint `2026-11-04T03:45:00Z` and requiredUntil `2026-11-04T04:00:00Z`. They were not rebased. The commands below ran at wall clock `2026-11-04T03:01:36Z`.

`runCheck` is unchanged and is still shared with `/scan` and MCP `check_ai_readiness`. Only the free-tool GET records this counter, once per request that reaches a terminal class. Downstream fetches of the checked site are not extra requests. Schema version stays 2. An empty delta omits `freeToolOutcomes`, so old pulse readers and a database that has not applied migration 0010 still accept ordinary flushes.

## File inventory

- `server/routes/tools.js` — GET handler records the terminal class. Response bytes for a finished check stay the score payload.
- `server/lib/pulse.js` — `recordFreeToolTerminal`, snapshot `freeTool`, once-guard, telemetry fault hook.
- `server/lib/pulse-store/free-tool-outcomes.js` — partition contract.
- `server/lib/pulse-store/schema.js` — optional delta field, validate, merge, RPC omit-when-absent.
- `server/lib/pulse-store/wal-schema.js` — v2 snapshot allowlist gains `freeToolOutcomes`.
- `server/lib/pulse-store/supabase-adapter.js` — read path validates a present value.
- `supabase/migrations/0010_pulse_free_tool_outcomes.sql` — nullable column, validate, merge, apply, read.
- `server/scripts/test-free-tool-outcomes.js` — handler and store tests.
- `package.json` — `test:pulse` includes that file.
- `docs/receiving/h145010-useful-tool-measurement-20261104/RELEASE-PROPOSAL.md`
- `docs/receiving/h145010-useful-tool-measurement-20261104/RESULT.md`

Unchanged: client and other human assets, H142 vendor tree and pin, migrations 0005 and 0006, the tracked historical `AE25-EXPORT.md`. `server/scripts/h120010-promote.mjs` was not run.

## Commands and exits

```text
node --test --test-concurrency=1 server/scripts/test-free-tool-outcomes.js
FREE_EXIT:0
# tests 12
# pass 12
# fail 0
# duration_ms 11789.070464
```

```text
PULSE_PG_BIN=/usr/lib/postgresql/16/bin node --experimental-strip-types --test --test-concurrency=1 \
  server/scripts/test-pulse-events.js \
  server/scripts/test-pulse-durable-store.js \
  server/scripts/test-pulse-s125-replay.js \
  server/scripts/test-pulse-refusal-contract.js \
  server/scripts/test-pulse-flush-retry.js \
  server/scripts/test-pulse-tool-contract.js \
  server/scripts/test-pulse-postgres-real.js \
  server/scripts/test-pulse-mcp-outcomes-contract.js \
  server/scripts/test-pulse-browse-coverage-contract.js
PULSE_EXIT:0
# tests 93
# pass 93
# fail 0
# duration_ms 12432.205034
```

This host has PostgreSQL 16 at `/usr/lib/postgresql/16/bin` and no PostgreSQL 17. The pulse helper still defaults to `/usr/lib/postgresql/17/bin`. The regression command above set `PULSE_PG_BIN` and exited 0. Unmodified `npm run test:pulse` was not the proof command. No live checker call, paid API, signer, funding, or production pulse database was used. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were unset.

## Semantic measurements

Loopback fixture `203.0.113.10`, host `h145010-loop.example`. The checked path was absent from `pulseSnapshot()` and from the WAL.

- Four completed checks, callers human, bot (`curl/8.5.0`), ai (`GPTBot/1.0`), and unknown (empty user agent). `requests` 4, `completed` 4. The fixture saw 16 hits (4 requests × page, robots, sitemap, llms). `total`, `humans`, `bots`, `funnel`, `byPath`, and `byReferer` stayed unchanged. Token-gated `GET /api/pulse` returned the same `freeTool` counts.
- Missing URL: HTTP 400 `Enter a website URL`, class `other_failure`. Unresolved `.invalid`: HTTP 400 `Could not resolve that domain`, class `invalid_host`. Literal `127.0.0.1`: HTTP 400 `That address isn't reachable for a public check`, class `invalid_host`. `GET /api/tools/nope` 404 and `OPTIONS` 204 added no free-tool count and no `total`.
- Closed local port: HTTP 502 `Could not reach that site`, class `unreachable`, `completed` 0, at least one TCP attempt.
- Hung local server: HTTP 502 `The site took too long to respond` after the real 10s abort, class `timeout`, fixture accepted a socket, `completed` 0. Duration about 10019 ms.
- Client disconnect after the fixture accepted the socket: class `abandoned` 1. The later fetch error did not become `unreachable`, `timeout`, or `completed`.
- Two `POST /api/pulse/event` bodies for `tool_check_done` returned 400. Free-tool coverage stayed `unknown`. A seller-repair brief event still returned 204 and `briefViews` 1.
- `GET /tools/ai-readiness` with a browser user agent: `humans` 1, `funnel.tools` 1, `total` 1, free-tool coverage `unknown`.
- Injected telemetry throw: the check still returned HTTP 200 with a numeric score and stayed unobserved. The next check counted `completed` 1 and `abandoned` 0.
- Concurrent success and invalid host: `requests` 2, `completed` 1 human, `invalid_host` 1 bot, 4 fixture hits.
- Flush then a new process with the same `PULSE_FILE`: `requests` 1, `completed` 1, caller human, coverage `lower_bound_from_first_observation`.
- Disposable PostgreSQL 16, migrations 0002, 0003, 0005, 0006, 0007, 0008, 0009, 0010: an old delta with `total` 3 and no free-tool key applied; readback `freeToolOutcomes` null. Two later outcome deltas merged to `requests` 2, `observedFrom` kept the earlier timestamp `2026-11-04T03:45:00.000Z`, `total` stayed 3. A partition that does not sum, and an unknown outcome key, were rejected. `anon` cannot execute apply. After `pg_ctl` restart the same totals were read. Grants: anon and authenticated cannot execute the new validator or merge; `service_role` can execute apply and read.

Classification schema version remained 2.

## Still unknown from these events

Unique people, owner versus outside caller, the checked URL, the score, any prompt, a Bing visitor, a PostHog click, a later return, payment, and revenue. Caller class is the existing user-agent class, spoofable, and not identity. `reportedAcquisition` is not stored on this object. Abandonment is only a close before a terminal class when the socket close is observable. MCP `check_ai_readiness` and `/scan` are separate surfaces. Checks before `observedFrom` are unknown. `SameDayDeskBot` fetches of a target site are not this counter.

## Release

See `RELEASE-PROPOSAL.md`. The hosted-wallet publisher is not required. Apply migration 0010 before the server that emits `freeToolOutcomes`. Read back token-gated `GET /api/pulse` field `freeTool`.

## Footprint

This writer process `grok-linux-x86_` pid 419323, parent `timeout` pid 419321: VmRSS 157552 kB, VmHWM 165160 kB, VmSize 464096 kB, 65 threads. No model child was started. The node test processes exited. Host `node` pid 319 (parent pid 7) was already present at VmRSS 1149912 kB and 148 threads and is outside this writer’s parent chain. Admission aggregate estimate was 2097152 KiB.

## Root next action

Review the draft PR on `codex/h145010-useful-tool-measurement-20261104`. Root owns receiving and installation. Apply `0010_pulse_free_tool_outcomes.sql` on the pulse database, then install this server commit. Read `freeTool` from the existing pulse snapshot. Do not treat `funnel.tools` or a browser completion event as the check outcome. Do not merge, deploy, or run `h120010-promote` from this worker.
