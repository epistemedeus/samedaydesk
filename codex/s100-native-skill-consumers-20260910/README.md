# S100 native skill consumers (2026-09-10)

Reproducible native Grok 4.6 xhigh consumer harness for SameDayDesk gateway skills PR2.

- Skills pin: `82d0f019713c7223898806144da08fdbeed5c666`
- Merchant pin: `8104629651fb31ea9fd4873de0017fa36b8bb0da`
- Skills repo write from this VM returned 403; this SameDayDesk branch holds the harness + sanitized evidence.

## Run
```bash
export S100_MERCHANT_DIR=/path/to/x402-url-extractor@8104629651fb31ea9fd4873de0017fa36b8bb0da
export S100_SKILLS_ROOT=/path/to/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666
export S100_STATUS_DIR=/tmp/s100-status
node consumers/native-s100/run-harness.mjs   # all cases
node consumers/native-s100/run-harness.mjs catalog-purchase-intent extract-402-stop
```

Paid endpoints and signing stay disabled. Owner-qa fixtures are labeled `owner-qa-deterministic-fixture`.
