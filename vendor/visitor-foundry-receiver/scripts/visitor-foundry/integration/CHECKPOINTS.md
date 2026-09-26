# VF04A checkpoints

Source baseline: receiving merge c239d99 with exact VF01 5c38974, VF02 47fe95c,
VF03 2689a19. Work is on the root-launched Cursor VM, single writer, no agents.

First implementation checkpoint precedes remote PostgreSQL tests. It includes
additive persistence, scoped replay of actual VF03 transitions, subprocess
reservation/termination reconciliation, VF01 manifests, outbox, cold CLI,
owned frozen inputs and two-host crash tests. Not yet accepted by tests.

The initial syntax check caught a missing parenthesis in the new router; fixed
before runtime tests. No foundation gates were removed. Full runtime failures
are retained in numbered evidence logs. Costs are unknown, not cap-as-spend.

- `9907ea2`: first implementation checkpoint before PostgreSQL acceptance.
- `ddaf820`: two-host crash recovery, 12/14-scenario intermediate acceptance,
  real capacity measurements and cold CLI evidence retained.
- `81daa872941534e0ea796ba4ed4c2c601f0b7a61`: final implementation, runtime
  pinning, exact scoped manifest rechecks and VF02 withdrawal propagation.
  Final remote integration run `integration-06.tap`: 15/15. Final benchmark
  `capacity-02.log`: 507 offered HTTP admissions; measured counts retained.

The first runtime run failed 2/7 harness cases (grant response field and strict
snapshot builder input). Both were fixed without foundation gate changes; the
failed TAP remains. Intermediate successful TAP files are not added to the final
test total. `verification-summary.json` reports 363 tests across the final eight
suites, with no failures/skips, and both builds passed. Documentation/export
commits follow the implementation pin; only this receiving branch is pushed.
