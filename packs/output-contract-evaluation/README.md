# Pack: output-contract-evaluation

Proposed $5 USDC offline evaluation. Engine:
`tools/output-contract-evaluation`. Fixtures live here.

Not published. No archive. No live SKU. Settlement is preserved when output
is invalid.

Advertised entry:

```bash
node tools/output-contract-evaluation/cli.mjs evaluate --pretty --case packs/output-contract-evaluation/fixtures/invalid-output-settlement-preserved.json
```

See [SKILL.md](SKILL.md) and [tools/output-contract-evaluation/README.md](../../tools/output-contract-evaluation/README.md).
