Received and repaired the gateway: persisted deadlines now fence provider/adapter
entry, and SDK diagnostics cannot print upstream text into host output. Added
decoded response bounds/replay integration, mounted monitoring isolation, CLI
help and an exact-source immutable 0.1.1 candidate. Homepages and SameDayDesk
source are unchanged.

- Branch: `codex/ae18-service-review-243002`.
- Validated implementation head: `4248874f2fa63636659fad164fb29ed193018104`;
  subsequent result/evidence-only commit changes no shipped runtime or archive.
- Actual tests: original **54/54** reproduced; final **59/59**, plus a separate
  exact-archive cold install/restart/recovery and final mounted integration recheck.
  Syntax, exported contracts and vendor pins pass. [Evidence](receipts/receiving/VALIDATION.md).
- Candidate: [0.1.1 archive](releases/neomorphic-machine-gateway-0.1.1.tgz), SHA-256
  `ee120eaac84f58f759d5857355220685cebcc53d739cead76700720a2821b53d`.
  The 0.1.0 archive is unchanged. Public read: 167 bytes, one GET, identical
  restarted receipt, zero payment calls. Paid evidence is unsigned local fixtures.

Remaining deployment action: 243001 consumes these scoped service fixes, installs
the candidate through the existing host integration, binds durable storage and
tenant grants, and records production authenticated execution/restart readback.
The manifest remains prepared, with no verified live route. No production
installation, live payment, main push, new model job or provider purchase occurred.
