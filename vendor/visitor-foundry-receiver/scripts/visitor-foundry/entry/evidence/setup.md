- The checkout initially lacked service node_modules and PostgreSQL binaries.
- `npm ci --prefix services/correspondence --ignore-scripts` installed 99 packages;
  audit reported zero vulnerabilities. Existing service TypeScript build passed.
- Installed Ubuntu PostgreSQL 16 packages on the assigned VM. The package-created
  main cluster remained down (policy-rc.d blocked startup). Acceptance uses its own
  temporary data/socket directory, loopback random port and maximum 32 connections.
- First checkpoint attempt failed because this new checkout had no Git author.
  Configured only this repository with the author already on its input commits:
  epistemedeus / 124947147+epistemedeus@users.noreply.github.com. No auth change/login.
- Checkpoint fb26ebb pushed using existing origin HTTPS authentication before tests.
- acceptance-01.tap: all 14 tests passed, zero skips. Subsequent review strengthened
  event-budget reservations before split-store commits; the later runs cover this.
- acceptance-02.tap: 16/16 passed after durable event-reservation hardening.
- acceptance-03.tap: 17/17 passed with bounded receiver waiting and strict client
  continuation validation; byte metrics now include actual socket HTTP bytes.
- Review caught a case-sensitive extension-path gate over Express's case-insensitive
  router matching. The gate was made case-insensitive before adding the real VF02
  optional-router test. No deployed code was affected.
- acceptance-04.tap: 19/19 passed, including two independent server processes.
- Final review separated receiver_started from receiver_state so durable pending
  readback is exact and stale pending cannot overwrite terminal ready/declined.
  acceptance-final.tap: 19/19 passed; final tested source commit a27e9e4.
- Existing correspondence regressions: 53/53 passed against an additional disposable
  cluster, zero skips. Root application build passed (81 pages).
