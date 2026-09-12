CW61 is exported as a foundation, not ready for integration.

The scoped D09/D10 consumer source, wrapper adapter, snapshot/comparison repairs, partial tests and original evidence are preserved. Native Grok Heavy is the next owner; follow `experiments/codex-window/cw61-repeat-replay-integration/GROK-HANDOFF.md` from a fresh actual Cursor Cloud checkout of this feature branch.

Recorded verification: six targeted regressions pass; the consumer suite has 42 pass and two failures (`actionable` expected, `analysis-partial` observed). Two actual current-wrapper replay processes completed, but the larger new integration suite has no completion summary. The legacy wrapper still exhibits added-row `no-budget-delta`; replay agreement is not a correctness oracle.

Tested shared dependency base: `76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be`. Remote main observed at closeout: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`, untested here. Shared engines/runtimes remain unchanged. No new large suite, default merge, deployment, payment, signing or credential access was performed during closeout.

Source host was the enrolled Grok VM/node_grok_bot_vm despite hostname `cursor`. Completed reproducible extracts were cleaned; source and evidence were retained. Final branch/head/PR export readback is in `CHECKPOINT.json` beside the checkout.

Export: draft PR https://github.com/epistemedeus/samedaydesk/pull/138; source foundation commit `e760812bb3193d7f01442916d2f06bf266b93660`. The foundation commit changes 132 scoped files. The PR comparison against main includes 738 files due to inherited integration-baseline divergence; it is a source handoff, not a merge candidate. The final documentation-only head and remote readback are recorded in the job-root checkpoint.
