# W5-D16 engine lifecycle harness

Thin consumer of SameDayDesk PR52 `server/paid-useful-jobs`. It does not reimplement useful-jobs.

Pinned implementation: `aeef964fa188443078958d9d6d393afae1d542ee`. Integration owner: W5-D01.

```bash
cd experiments/wave5/d16
node --test --test-timeout=120000 test/*.test.mjs
node bin/lifecycle-harness.mjs test
node bin/lifecycle-harness.mjs positive
```
