# Independent receiving validation

Received gateway base `7e5078bbf213ae3d1ff8d4638199ff8d1d1d81a8` on
`codex/ae18-service-review-243002`. Node v22.14.0, npm 10.9.9. Heavy commands
were serialized with `/home/ubuntu/.cache/pilot-ae18-build.lock`; sampled
available memory exceeded 5 GiB. Other jobs and worktrees were preserved.

- Replayed the published clean `npm ci --ignore-scripts --no-audit --no-fund`,
  `npm run check`, and `npm test --prefix services/machine-gateway` commands.
  The claimed **54/54** baseline reproduced. See `baseline-tests.tap`.
- Failing-first checks reproduced provider entry after a persisted deadline
  and SDK extension headers printing arbitrary upstream text to host output.
  The repairs check the persisted clock at every provider/adapter entry and
  privately drain isolated SDK output. See `regressions-before.tap` and
  `regressions-after.tap`.
- Final full command: `flock /home/ubuntu/.cache/pilot-ae18-build.lock npm test
  --prefix services/machine-gateway`: **59 passed, zero failed/skipped**.
  Added actual SDK gzip/decode bounding with one possible settlement only,
  restart/replay after an ambiguous reply, and mounted gateway/monitor authority
  isolation. The latter was rechecked after the final monitor timeout repair.
- `final-check.log` confirms syntax, schema/OpenAPI exports and original vendor
  source pins. Shared pages, journey packages and actual SameDayDesk files are
  absent from the diff. The existing host patch was left unchanged.

The original 0.1.0 archive matched all 42 shipped files before repairs and
remains byte-identical at SHA-256
`730a959d3d8bd7398a68015cc8f3ca1746170c0177093d5bf0d03faa75c832d3`.
The new immutable **0.1.1** candidate is 49,637 bytes, SHA-256
`ee120eaac84f58f759d5857355220685cebcc53d739cead76700720a2821b53d`.
The release test compares its complete file list and every shipped byte with
current source. `exact-candidate-cold.tap` separately runs the cold test using
that exact archive through `MACHINE_GATEWAY_TEST_ARCHIVE`, not a freshly packed
substitute: clean locked production-only dependencies, all three CLI help
commands, enrollment, useful lockfile work, readiness, server restart, and
identical receipt recovery in fresh caller processes. No tests/state/credentials
are shipped in the archive. `candidate-before.tap` preserves the consistency
failure after runtime repairs and before rebuilding/versioning the candidate.

`public-smoke.json` records the actual published read-only command: one free
public HTTPS response, HTTP 200, 167 bytes, same receipt after restart and two
cold caller processes, zero payment calls. This is a local mounted gateway using
a public upstream. It proves neither a hosted gateway installation nor live
settlement. SDK payment evidence throughout remains unsigned local fixtures.
The dedicated manifest remains `prepared-not-deployed`, with no verified live
base URL or production activation.

Raw TAP/log records have trailing whitespace normalized for Git; outcomes and
diagnostics are preserved. `verification.json` indexes the counts and artifact.
