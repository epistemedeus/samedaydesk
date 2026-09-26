# Foundry host amendment, September 26

Root amended the host adapter over Heavy export `1e71d73d37d9f3f83c42bfab12e503ebb87e6ec8` on the same Cursor VM and branch.

- Stop requests drain the current bounded canonical pass and prevent later phases. The wrapper no longer unconditionally SIGKILLs a healthy pass after eight seconds. The canonical supervisor retains responsibility for assignment deadlines and durable termination evidence.
- A failing phase remains a failure when shutdown was requested.
- Readiness failure closes the extension and base once, preserves the readiness error, and closes the base even when extension cleanup fails. The vendored hook delta is disclosed in FOUNDRY-PIN.json.

Remote verification: `node --test server/scripts/test-foundry-host.js server/scripts/test-foundry-drain.js server/scripts/test-foundry-probe.js`: 19 passed, 0 failed/skipped, 10.9 seconds. Includes a healthy ten-second child surviving shutdown, cleanup failures, and propagation of phase errors.

This is focused wrapper evidence, not proof of SIGTERM during an actual claimed Postgres assignment. That integrated check belongs with the current VF12 receiver join. This branch still pins the earlier F93/VF08 receiver and is not yet a production deployment or Hostinger runtime acceptance.
