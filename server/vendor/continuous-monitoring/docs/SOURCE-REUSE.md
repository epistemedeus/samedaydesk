# Source decisions

Read before implementation:

- Neo `ccffedf3`: `packages/change-monitor/src/transition.mjs`, `subscription.mjs`, `service.mjs`, `store.mjs`, `deliver.mjs`, `canonical.mjs` and the maintained source-projection adapter. The CLI is one shot; its subscriptions prohibit arbitrary URLs. Its whole-state JSON file and process lock do not provide a cross-process schedule journal or tenant API.
- `epistemedeus/samedaydesk` main `d8cea059213e06d2f263be67f82e498f8052a50f`: read current `server/lib/managed-watch/claim.mjs` and `source.mjs` through enrolled GitHub CLI. Also read the local `f4d43dd14228d3f7ab2d3c0a5f97dca2ed00e23a` checkout's scheduler, Postgres store and `tools/recurring-job-recipes/recipes/source-change-alert.mjs`, fetch policy and source read contract. These have finite budgets, immutable priors, claim-before-read, response staging and unknown recovery. Their grant schema and pinned Observatory source are specific to the SameDayDesk server; this service does not create another correspondence/watch host or modify that deployment.

Runtime reuse is direct, without a downloaded archive or copied engine:

- `applyObservation`, `emptyState`, `emptyUsage` and `sealObservation` from Neo classify baseline, unchanged, content change, unavailable evidence and restoration, and provide event identity and useful-event admission.
- `canonical`, `digestJson`, `sha256` provide the same material comparison semantics.
- `parseSnapshot`, `projectSnapshot` and `sourceProjectionAdapter` consume the existing Observatory schema and refuses partial, stale, unavailable and mixed-population evidence.

The service adds the missing HTTP source boundary, SQLite per-tenant scheduler and immutable journal, inbox polling and accounting. The SQLite transaction replaces a whole-file lock and retains the existing claim / staged-response / unknown-read recovery protocol. DNS is pinned into the socket lookup, extending SameDayDesk's pre-resolution validation. No release-gate acquisition, model request, payment or gateway is involved.

Packaging must include `packages/change-monitor/package.json`, `packages/change-monitor/src/` and `packages/change-monitor/vendor/s12-observatory/` at their existing relative paths, including vendor provenance. The deployment recipe runs from the existing repository checkout; this directory alone is not a standalone package. The receiving cold-source test copies only this service and those existing foundation paths into a clean temporary tree, with no node_modules or dependency installation, and executes the documented demo and CLI help there.
