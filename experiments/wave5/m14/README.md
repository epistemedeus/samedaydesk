# W5-M14 result preview

Machine-first quickstart and human preview over the current SameDayDesk paid useful-jobs wrapper. Not a second engine and not a live sale.

```bash
node experiments/wave5/m14/bin/preview.mjs quickstart
node experiments/wave5/m14/bin/preview.mjs choose --files path/before.json path/after.json
node experiments/wave5/m14/bin/preview.mjs preview --job vendor-budget-impact --before path/before.json --after path/after.json --format text
```

Default stdout is JSON. Add `--format text` for a readable excerpt. Tests:

```bash
node --test --test-concurrency=1 experiments/wave5/m14/test/*.test.mjs
```
