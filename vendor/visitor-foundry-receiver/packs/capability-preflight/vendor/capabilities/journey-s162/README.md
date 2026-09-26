# BOT-S162 — R2 Capabilities Journey (Heavy pin integrated)

Eight-component install/import/CLI journey for Pilot Capability Delivery R2.

- **Native:** Cap01 / Cap04 / Cap05 / Cap07 / Cap08 (relative in-repo imports)
- **Heavy:** Cap02 / Cap03 / Cap06 via `experiments/s138-capability-evidence` at pin
  `2dcb01713acdc1bb45eec7c8b21b0092a08b2e8c` (S146 RETURNED)

## Flow

1. Cap01 envelope
2. Cap02 `resolvePrerequisites` (Heavy)
3. Cap03 `bindEvidence` (Heavy)
4. Cap04 cost dry-run
5. Cap05 fallback (as needed)
6. Cap06 `composePartial` (Heavy)
7. Cap07 buyer context pack
8. Cap08 walkthrough

## Honesty (S161 / BOT-INTEGRATION)

- Preserve `unknown` / `partial` / `not_ready` / `untested_declaration`
- Never invent `ready` / `bound` from empty reports
- **TAP `# pass` / hashing does NOT prove tests ran against claimed revision**
- `readyForRelease` stays `false` (not set from TAP alone)
- Do **not** treat Heavy's 259 tests / 36 CLI sessions as journey acceptance

## CLI

```sh
node src/cli.mjs install
node src/cli.mjs status
node src/cli.mjs demo
npm test
```

Node ≥ 20; zero dependencies; offline dry-run only.
