# Foundry host amendment, September 26

Root amended the host adapter over Heavy export `1e71d73d37d9f3f83c42bfab12e503ebb87e6ec8` on the same Cursor VM and branch.

- Stop requests drain the current bounded canonical pass and prevent later phases. The wrapper no longer unconditionally SIGKILLs a healthy pass after eight seconds. The canonical supervisor retains responsibility for assignment deadlines and durable termination evidence.
- A failing phase remains a failure when shutdown was requested.
- Readiness failure closes the extension and base once, preserves the readiness error, and closes the base even when extension cleanup fails. The vendored hook delta is disclosed in server/foundry/PINS.json and vendor/visitor-foundry-receiver/SOURCE-PIN.json.

Remote verification: `node --test server/scripts/test-foundry-host.js server/scripts/test-foundry-drain.js server/scripts/test-foundry-probe.js`: 19 passed, 0 failed/skipped, 10.9 seconds. Includes a healthy ten-second child surviving shutdown, cleanup failures, and propagation of phase errors.

This is focused wrapper evidence. The VF12 join keeps this drain behavior and adds the claimed-assignment SIGTERM check. Readiness close now comes from the canonical correspondence `prepareFoundryHost` at receiver `1652533b1823ac33b86591ec4e931a8c4ea4aa97`, which closes the extension and the base once. The SDS mount closes the entry facade before the base store and binds the original `checkReady` before composing it. This branch is not a production deployment or Hostinger runtime acceptance.
