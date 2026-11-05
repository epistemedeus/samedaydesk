# E07 buyer-intent discovery

Outcome: no_fit
No open candidate describes a supported problem within the offline service boundaries. This page is not a demand census.
Acquisition: recorded; explicit; 2026-11-05T20:38:11.133Z UTC; API 2022-11-28
Query: is:issue is:public "compare" "snapshots" "json"
Open problem fits: 0; needs_scope: 0; scope inquiries: 0; execution ready: 0
Read-only. Problem fit, contact readiness, execution readiness, and paid intent are separate.
No purchase, reply, contact, execution, commission, or observed payment is claimed.

## no_fit: Visual baseline: save snapshots and compare
https://github.com/prabhuakshay/webtester/issues/9
Label: source_record
State: open; created: 2026-10-15T07:51:32Z; updated: 2026-10-15T09:28:35Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## What to build  Let the user save a **baseline**: a snapshot of every current screen for the current URL. Later, a compare view shows each screen's baseline against the live page with a before/after slider.  Baselines are stored locally (per URL and per screen) and can be replaced or deleted.  ## Acceptance criteria  - _ _ Save baseline captures every screen for the current URL - _ _ Compare vie
Boundary: Visual diff, screenshots, and screen baselines are not offline page-change comparison.

## no_fit: Add _kbom diff_ to compare two KBOMs
https://github.com/rad-security/kbom/issues/193
Label: source_record
State: open; created: 2026-10-26T11:04:23Z; updated: 2026-10-26T11:04:23Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: Add a _kbom diff old.json new.json_ command showing what changed between two snapshots: Kubernetes version, nodes, images, components and resource counts. Useful for drift detection, upgrade reviews and audit evidence. Support human-readable and JSON output.
Boundary: Arbitrary JSON or inventory diff is not page-change comparison of extract-batch snapshots.
