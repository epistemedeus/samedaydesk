# Producer / consumer examples

1. **02 install readiness** — producer: `fixtures/manifests/package-ready.json`; consumer: `resolve-prereqs` (see `demo-out/02-prereq.json`).
2. **03 evidence binding** — producer: source + TAP; consumer: `bind-evidence` (`demo-out/03-bound.json`).
3. **06 partial composition** — producer: partial parts; consumer: `compose-partial` (`demo-out/06-partial.json`).

Run: `node bin/capability-evidence.mjs demo`
