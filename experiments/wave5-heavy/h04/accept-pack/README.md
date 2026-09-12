# H04 cold-caller accept-pack

Executable cases for the four M01 engines at composition `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`. Does not amend M01/`tools/*` or D01.

```bash
cd experiments/wave5-heavy/h04
node accept-pack/bin/accept.mjs list
node accept-pack/bin/accept.mjs run
node accept-pack/bin/accept.mjs delivery-negative
```

RO worktree cwd for engines: `/tmp/w5-h04/ro-m01`.

- Seven public lockfile cases are included from `examples/lockfile-public/` (not multiplied).
- Refusal is a useful output. Missing promised files (`pin-delta.json` etc.) **fail delivery**.
- Oracles live beside each case (`expected-facts.json` from raw inputs).
- Buyers: `buyers/BUYERS.md`.
