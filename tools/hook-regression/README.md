# W3-12 G02 — hook regression package

Presence-only diagnostics that freeze merchant PR54 indexing-continuity rules.
Does not install live ResourceServer hooks.

## Literal journey

```sh
cd tools/hook-regression
node bin/hook-regression.mjs journey --fixture fixtures/ok-payload.json
```

Tests: `npm test` in this directory, or `npm run test:hook-regression` from the repo root.
