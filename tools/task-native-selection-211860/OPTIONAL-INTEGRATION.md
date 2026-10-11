# Optional integration

Not applied. `package.json`, `tools/portfolio-discovery`, `tools/presence`, `tools/l08-agent-repair`, `client/public`, and homepage copy stay as they were.

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
