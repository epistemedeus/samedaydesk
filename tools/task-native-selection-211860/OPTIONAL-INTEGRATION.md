# Optional integration

Not applied to the root package. `tools/portfolio-discovery`, `tools/presence`, `client/public`, and homepage copy stay as they were. The maintained pure module `tools/l08-agent-repair/lib/readiness-contract.mjs` is part of this product. `tools/l08-agent-repair/lib/task-readiness.mjs` re-exports it and still imports the server for the canonical route.

If a later receiving change wants the existing test runner to execute this package, add one script and nothing else:

```diff
--- a/package.json
+++ b/package.json
@@
     "test:portfolio-discovery": "node --test tools/portfolio-discovery/test.mjs tools/portfolio-discovery/search-readiness.test.mjs tools/portfolio-discovery/handoff.test.mjs",
+    "test:task-native-selection-211860": "npm --prefix tools/task-native-selection-211860 test",
```

Do not point the portfolio catalog, presence refresh, or the readiness mount at this selector. Callers pass a catalog file and a task file. A keyword search stays on `list` and cannot select.

No ClawHub publish, skill scan, homepage edit, or paid route call belongs in that integration.

Root integration, after the product commit is on the feature branch:

```
git fetch origin cursor/pilot-211860-task-native-distribution-and-cold-selection-experiment-d4c4
git checkout main
git merge --no-ff <product-commit>
```

Run the readiness regressions with the repository dependencies installed, and the package tests from the package:

```
npm ci --ignore-scripts
npm run test:l08-agent-repair
node --test --test-concurrency=1 tools/l08-agent-repair/test/readiness-contract.test.mjs
npm --prefix tools/task-native-selection-211860 test
```

Do not install Express in order to import `readiness-contract.mjs`. That module has no package imports. Do not deploy, and do not point the readiness mount at this selector.
