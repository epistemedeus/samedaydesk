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

Unchanged at the first delivery: client and other human assets, the H142 vendor tree and pin, migrations 0005 and 0006, and the tracked historical `AE25-EXPORT.md`. `server/scripts/h120010-promote.mjs` was not run. Amendment 1 below joins the measurement runtime into the host pin. The vendor package bytes stay the same.

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

## Amendment 1

The first 12 free-tool passes were real. They did not close the host pin that `hostSourceSha256` reads, so the configured runtime consumer still failed at the normal host closure.

Root's integration `d3a9d82f0aed25b8f5dcef70096982ef93083810` is the parent of this handoff. It was fast-forwarded onto this branch and keeps both histories. Its own record is unqualified, uninstalled, and not a production release. This amendment did not edit the H142 or H147 writer checkouts.

### Original observation

From `/home/ubuntu/root80809-release/RECEIVING.json` at `2026-11-04T04:02:18.285Z`: `beforeCorrection.exit` 1, `afterCorrection.exit` 0, `combined.exit` 1, `qualified` false, `installed` false, `productionMutation` false. The focused catalog correction is inside `d3a9d82f0aed25b8f5dcef70096982ef93083810`. Root receiving for source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` and host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255` belongs to that H142 slot.

`/home/ubuntu/root80809-release/COMBINED-RELEASE-REGRESSION.json` exit 1, signal null, 48 tests, 40 pass, 8 fail, 0 skipped, duration_ms 21445.306764. The eight failures are `binding_stale`:

- empty data publishes through the mounted store and the 0.3.1 client
- candidate measurement is the admitted source and host
- current tree treats the cafd packet as stale and does not rewrite it
- proposal matches a fresh measurement and enrollment refuses without Root receiving
- kept historical packet still fails closed on the profile comparison
- positive current packet decodes into the configured participation test
- ordinary producer enrollment selects and decodes the current source beside the historical slot
- the host pin refuses a changed or missing accepted-work runtime and recovers

The pin at that commit still hashed `package.json` from before the pulse script change and did not include the pulse and tools files the host loads.

### Corrected binding

`hostSourceSha256` compares every `private-control-pin.json` member with the file bytes, then hashes those files and the pin. The narrow join refreshed the host-owned producer script and appended the measurement files from their actual bytes. `pin.base` stays `4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134`. The predecessor closure was received from `d3a9d82f0aed25b8f5dcef70096982ef93083810`. `SOURCE.json` was not rewritten. The full refresh path was not run.

Measured pair:

- source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`
- host `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`

H146's H142 binding stays the older host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255` with the same source. That received slot remains in the catalog. This host is a separate candidate. Neo's quote map is keyed by source, and this source still selects `qualified_selection_required`. No quote key was added.

The unreceived proposal is under `docs/receiving/h145010-useful-tool-measurement-20261104/`. Anchor sha256 `0e740074bdf6f7178b42cff4f92934e05cc1d543131cefc627eabe88017bd46b` (925 bytes). Descriptor sha256 `2066f94ad3bf555bf5fe46314aad7f4827d5580dac3ca14b4942529781d991c2` (890 bytes). Enrollment sha256 `3b1d61eb5d7fcc64ddaaa1030cdd27dfb38ba0f7fdf26573f82ada9ba00fde8a` (42556 bytes). It has no `receiving` key. The enrollment's `measured.baseCommit` is the integration parent. The fingerprint is the successor commit that contains this pin. The historical cafd packet and the H147 proposal bytes for the H142 profile were left in place.

Migration `0010_pulse_free_tool_outcomes.sql` is the file from `9a6177a1a1551dd727f3edb9f67302afb9437c14` (author and committer `2026-11-04T03:02:56Z`). This amendment did not apply it, did not observe a live apply, and did not invent a tool call. Root's product-route note that the column stayed NULL stands. The rollback in `RELEASE-PROPOSAL.md` keeps mixed WAL rows: drain complete rows through the capable reader and receive the acknowledgement, otherwise forward-repair. A mixed or unknown row is kept.

### Corrected commands

```text
AE14_PG_BIN=/usr/lib/postgresql/16/bin PULSE_PG_BIN=/usr/lib/postgresql/16/bin \
ROOT10940_CI_CATALOG=server/scripts/fixtures/root10940-approved-ci-packets \
node --test --test-concurrency=1 \
  vendor/hosted-wallet-market/test/accepted-work-closure.test.mjs \
  server/scripts/test-h142010-empty-artifact-data.mjs \
  vendor/hosted-wallet-market/test/accepted-work-empty-data.test.mjs \
  vendor/hosted-wallet-market/test/accepted-work-publication.test.mjs \
  server/scripts/test-free-tool-outcomes.js \
  server/scripts/test-h147010-source-bound-ci-input.mjs \
  server/scripts/test-postgres-bin.mjs \
  server/scripts/test-h145010-measurement-runtime-pin.mjs
COMPOSED_EXIT:0
# tests 54
# suites 1
# pass 54
# fail 0
# skipped 0
# duration_ms 58234.784511
```

That is H142's 11 cases, the 12 free-tool cases, H147's 18 source cases, H147's 7 Postgres-bin cases, and 6 measurement-pin cases. The count is the run above, not the old 48.

```text
PULSE_PG_BIN=/usr/lib/postgresql/16/bin node --experimental-strip-types --test --test-concurrency=1 \
  server/scripts/test-free-tool-outcomes.js \
  server/scripts/test-pulse-events.js \
  server/scripts/test-pulse-durable-store.js \
  server/scripts/test-pulse-s125-replay.js \
  server/scripts/test-pulse-postgres-real.js \
  server/scripts/test-pulse-tool-contract.js \
  server/scripts/test-pulse-flush-retry.js \
  server/scripts/test-pulse-refusal-contract.js \
  server/scripts/test-pulse-mcp-outcomes-contract.js \
  server/scripts/test-pulse-browse-coverage-contract.js
PULSE_EXIT:0
# tests 105
# suites 1
# pass 105
# fail 0
# skipped 0
# duration_ms 24006.297849
```

```text
node server/scripts/publish-preserved-client.mjs
PUBLISHER_EXIT:0
{"ok":true,"viteInvoked":false,"files":352,"bytes":59951737,"inventorySha256":"6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5"}
```

```text
npm run test:proxy-addr
PROXY_EXIT:0
# tests 13
# pass 13
# fail 0
# skipped 0
# duration_ms 6036.126699
```

```text
AE14_PG_BIN=/usr/lib/postgresql/16/bin node server/scripts/select-root10940-ci-packet.mjs \
  --catalog server/scripts/fixtures/root10940-approved-ci-packets \
  --index server/scripts/fixtures/root10940-approved-ci-packets/index.json \
  --legacy-env \
  --out /tmp/h145010-amend1-selected.json \
  --enrollment-out /tmp/h145010-amend1-enrollment.json
SELECT_EXIT:3
stale actual 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82 expected 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82
```

The selected packet file was absent. The enrollment class was `stale`, `received` false, and the measured host was `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`. The same-source message is the first catalog row, which is the received H142 slot. Its host does not match this candidate, so the selector exits 3 and writes no packet. The disposable fixture receipt in `test-h145010-measurement-runtime-pin.mjs` selected and decoded the measured host on a copy and left the committed index unchanged.

No model child was started. The first-delivery footprint above is unchanged as a record of that process. Migration 0010 was not applied. No deploy, signer, grant, funding, payment, outside message, or default merge was performed. `h120010-promote` was not run.

## Final head

Repair commit `a05d5b160bcb9c1fb1e48424abfdbb4ab705f874`, tree `6781fde8053a65bb91a9dc33685445ee0d1937c3`, pushed `24b5c8b7..a05d5b16`. This section does not change a pinned file. `hostSourceSha256` stays `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654` on the branch tip. Root receives that tip.

## Root next action

Review draft PR https://github.com/epistemedeus/samedaydesk/pull/352 on `codex/h145010-useful-tool-measurement-20261104`. The head to receive is the pushed commit that contains this pin, not `d3a9d82f0aed25b8f5dcef70096982ef93083810` and not the H142 host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255`.

Root's next control is an independent replay of that head. On a copy, add `receiving` to the proposed anchor only after that replay, then enroll a new catalog slot named `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82-8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654.json`. Leave the cafd slot and the H142 slot in place. Set `ROOT10940_CI_PACKET` only for that new packet. Until then the workflow receive step exits 3.

Apply `0010_pulse_free_tool_outcomes.sql` on the pulse database before installing a server that emits `freeToolOutcomes`. Read `freeTool` from token-gated `GET /api/pulse`. The preserved client boundary remains 352 files, 59951737 bytes, inventory `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5`. Do not merge, deploy, or run `h120010-promote` from this worker.
