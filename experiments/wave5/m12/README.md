# W5-M12 selected offer description

Machine-readable capability and pricing for the SDS52 supplied-input useful jobs.
Every advertised job, price, and limit is checked against the current wrapper CLI
and live catalog pins. Fixture `0.02` is not a live sale. Extract `$0.005` and
seller-integrity-audit `$0.01` stay adjacent live products.

From the repository root:

```bash
node experiments/wave5/m12/bin/describe.mjs
node experiments/wave5/m12/bin/verify.mjs
cd experiments/wave5/m12 && node --test --test-concurrency=1 test/*.test.mjs
```

See [CONTRACT.md](CONTRACT.md) for the consumer interface. W5-M01 catalog
selection and W5-D26 cost floor are consumed when present and left unbound here.
