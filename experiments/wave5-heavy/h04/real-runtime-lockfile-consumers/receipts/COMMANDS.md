# No-key inspection commands (actually run)

Live origin only. Never send PAYMENT-SIGNATURE / X-PAYMENT / a wallet.

```bash
# OpenAPI 1.23.48 lists POST /lockfile-pin-delta at 0.005 USDC x402-only
curl -sS https://agents.samedaydesk.com/openapi.json | python3 -c \
  'import json,sys; s=json.load(sys.stdin); print(s["info"]["version"], s["paths"].get("/lockfile-pin-delta",{}).get("post",{}).get("x-payment-info"))'

# Unpaid 402 with a valid lockfile JSON body
curl -sS -D - -o /tmp/lockfile-402.body \
  -X POST https://agents.samedaydesk.com/lockfile-pin-delta \
  -H 'content-type: application/json' -H 'accept: application/json' \
  --data-binary @experiments/wave5-heavy/h04/real-runtime-lockfile-consumers/clients/customer-x402/authorization-lockfile.json
# Use the serialized {before,after} object, not the whole authorization file, in real curls.
# This package's live-unpaid test POSTs fixtures/before.json + after.json.

# Invalid body
curl -sS -D - -X POST https://agents.samedaydesk.com/lockfile-pin-delta \
  -H 'content-type: application/json' -d '{}'

npx --yes @agentcash/discovery@1.7.5 discover https://agents.samedaydesk.com --json
npx --yes @agentcash/discovery@1.7.5 check https://agents.samedaydesk.com/lockfile-pin-delta --json
```

Customer-x402 unpaid:

```bash
cd examples/customer-x402   # merchant pin 7aaf004
npm run preflight -- --authorization ./fixtures/authorization-lockfile.json
```
