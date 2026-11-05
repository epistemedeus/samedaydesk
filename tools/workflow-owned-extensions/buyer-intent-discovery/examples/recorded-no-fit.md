# E07 buyer-intent discovery

Outcome: no_fit
No acquired candidate explicitly qualifies within the supported offline service boundaries.
Acquisition: recorded; 2026-11-05T20:38:11.133Z UTC; API 2022-11-28
Query: is:issue is:public "compare" "snapshots" "json"
Fit: 0; no-fit: 2
Read-only. No purchase, reply, contact, execution, or accepted delivery is claimed.

## no_fit: Visual baseline: save snapshots and compare
https://github.com/prabhuakshay/webtester/issues/9
Task: ## What to build  Let the user save a **baseline**: a snapshot of every current screen for the current URL. Later, a compare view shows each screen's baseline against the live page with a before/after slider.  Baselines are stored locally (per URL and per screen) and can be replaced or deleted.  ## Acceptance criteria  - _ _ Save baseline captures every screen for the current URL - _ _ Compare vie
Reasons: requires_implementation_or_unsupported_acquisition, no_explicit_supported_supplied_evidence_task

## no_fit: Add _kbom diff_ to compare two KBOMs
https://github.com/rad-security/kbom/issues/193
Task: Add a _kbom diff old.json new.json_ command showing what changed between two snapshots: Kubernetes version, nodes, images, components and resource counts. Useful for drift detection, upgrade reviews and audit evidence. Support human-readable and JSON output.
Reasons: requires_implementation_or_unsupported_acquisition, no_explicit_supported_supplied_evidence_task
