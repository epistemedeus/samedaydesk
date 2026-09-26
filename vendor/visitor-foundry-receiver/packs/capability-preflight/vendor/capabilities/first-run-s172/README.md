# BOT-S172 — Cap first-run (examples-only)

Real caller input → prerequisite → partial-result against **exported** Cap01 + Heavy Cap02/06 sources.

- Base examples tip: `72feb5bbbb1722c3ad349ccbc420a9ebc6555e22`
- Heavy pin (consumed, not forked): `2dcb01713acdc1bb45eec7c8b21b0092a08b2e8c`
- **S164 residual out of scope** (no source collision)
- `executionVerified: false` always — TAP/text does not prove execution
- No paid invoke / invented traffic
- Feature-branch only — not production merge/public release

```sh
node src/cli.mjs status
node src/cli.mjs demo
node src/cli.mjs demo-catalog
node --test tests/*.test.mjs
```
