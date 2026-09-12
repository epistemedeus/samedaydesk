# CW40 native Codex consumer receipt

2026-09-12, Linux VM, Node v22.23.2, uid/gid 1000. No child model.
Scope: `experiments/codex-window/cw10-real-schema-consumer/` only.

## Exact inputs

- Consumer source base: `505f90f1de26fcf1bea627806361cdc178db13f4`.
- Official parent: `237b6924bcbfd2d0d36e7233d36c2c6bc21fa2a2`.
- Official change: `e69d6eca4e5f1505afacd0677c4303877caca0d6`.
- Released 1.4.0 source: `817a00ca226a94b0e198b29fcd06245b2a92adec`.
- Release SHA-256: `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
- CW14 exported head: `8b75201761a8b58a6d00f16d9eb825c15fc5b68b`, fetched
  from its published branch into this consumer's checkout. The sibling
  workspace was neither executed nor modified. Engine tree is in the report.

## Acceptance

- Consumer regression suite: **12 pass, 0 fail, 0 skip**.
- Unmodified released archive suite: **15 pass, 0 fail, 0 skip**.
- Read-only CI command: **exit 0**; it also verifies compatibility-gate **exit 1**.
- All 11 upstream files independently fetched from exact official commits and
  matched for bytes and SHA-256; the official API confirms the adjacent parent.
- Full Ajv Draft7 closure: 5 before + 4 after resources compile without network;
  URI and URI-template formats enabled; legacy/migrated and negative controls
  pass their asserted outcomes.
- Released and CW14 exact-schema keyword selections: `informational`, 2
  unchanged, 0 breaking, 0 unknown. The false negative persists in CW14.
- Both full-root attempts: exit 2, `remote-ref-refused`.
- Both derived-root projection attempts: `actionable`, 1 breaking.

Canonical checked-in evidence: [report](output/report.json),
[consumer tests](output/consumer-tests.tap), [release tests](output/released-tests.tap),
[upstream readback](output/source-verification.json).

## Seven historical ownership failures

Work previously recorded 8/15 passing, with seven nested tar ownership failures.
This run uses the legitimate GNU tar environment
`TAR_OPTIONS=--no-same-owner`, so nested extraction retains the current user's
ownership. The entire release suite passes with its code, assertions, archives,
and vendor pins unchanged. The old root/container ownership failure itself was
not reproduced on this uid-1000 VM; this is a successful constrained rerun, not
a claim to have repaired Work's separate container.

Final acceptance uses one test worker, Node heap 768 MB, an owned process group,
and only loopback port 55547. A consumer-only Node preload maps the upstream
archive test's `listen(0)` to that assigned port; its TAP marker confirms use.
The initial exploratory release-suite run used its default ephemeral loopback
port before that adapter was added. Final CI was rerun with the assigned port.

## Evidence boundary

The schema correction is from 2022. The parent has no official renamed payload
at the corresponding path (404). The legacy body is composed from exact official
examples and validated against the exact full schema, not a captured old GitHub
delivery. Removing membership from `required` alone does not break acceptance;
removing its allowed property under a closed object does. Self-authored tests
with a separate Ajv validator establish this bounded counterexample, not
independent production use, customer demand, or revenue.

Shared engines and other writers were not modified. No production merge,
deployment, payment, transaction signature, provider change/spend, or outreach.
