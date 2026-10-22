# Seeded pointers

- `false-accept.json` — stale 1.4.0 pin claimed `accept`. Product rejects. `run.mjs --seeded-failure` / `--fixture … --expect accept` exits 1, `SEED_REJECT`.
- `matching-current.json` — live 1.4.7 pin claimed `accept`. Product also accepts. `--fixture` exits 1, `SEED_MISS` (did not diverge).
