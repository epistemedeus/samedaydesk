# LQDIST1 exact unpaid replay commands

Scratch only. Do not commit `preflight-x402` or the Agent402 clone. Never send `PAYMENT-SIGNATURE`, `X-PAYMENT`, or a wallet.

## Scratch install

```bash
mkdir -p /tmp/lqdist1-scratch
cd /tmp/lqdist1-scratch
npm init -y
npm install preflight-x402@0.2.0 @agentcash/discovery@1.7.5
git clone --depth 1 https://github.com/MikeyPetrillo/Agent402.git
```

## 1. Enumerate canonical paid routes

```bash
curl -sS https://agents.samedaydesk.com/openapi.json | python3 -c '
import json,sys
spec=json.load(sys.stdin)
print(spec["info"]["title"], spec["info"]["version"])
for path, methods in spec["paths"].items():
    for method, op in methods.items():
        if isinstance(op, dict) and op.get("x-payment-info"):
            print(method.upper(), path, op.get("operationId"), op["x-payment-info"]["price"]["amount"])
'

curl -sS https://agents.samedaydesk.com/.well-known/x402
curl -sS https://agents.samedaydesk.com/.well-known/paid-action-effects.json
```

Bounded output: [`evidence/openapi-head.json`](evidence/openapi-head.json), [`evidence/canonical-routes.json`](evidence/canonical-routes.json), [`evidence/x402-manifest-bounded.json`](evidence/x402-manifest-bounded.json).

OpenAPI 3.1.0 title `SameDayDesk machine commerce gateway` version `1.23.40`. 25 paid operations. Manifest `items` length 23 (GET+POST collapsed to one resource URL; plus Circle Gateway alternate).

## 2. What Agents Buy preflight-x402

```bash
cd /tmp/lqdist1-scratch
node --input-type=module <<'JS'
import { preflight, paymentProof } from "preflight-x402";
const urls = [
  "https://agents.samedaydesk.com/extract",
  "https://agents.samedaydesk.com/read",
  "https://agents.samedaydesk.com/security/wallet-policy-conformance",
];
for (const url of urls) {
  const v = await preflight(url, { detail: true, timeoutMs: 8000, client: "lqdist1-distribution-audit/0.1" });
  console.log(JSON.stringify({
    url, light: v.light, verdict: v.verdict, confidence: v.confidence, score: v.score,
    proof: paymentProof(v), unavailable: v.unavailable || false,
  }));
}
JS

curl -sS https://whatagentsbuy.com/api/preflight.json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d["sellers"]["agents.samedaydesk.com"], indent=2))'
```

Bounded output: [`evidence/wab-host.json`](evidence/wab-host.json).

Host verdict: `light=green`, `verdict=CLEAR`, `confidence=verified`, `score=100`, `receipts=1`. The package extracts the host, so every SameDayDesk route inherits this CLEAR.

## 3. Agent402 inclusion / health

```bash
# live snapshot used for inclusion/health
curl -sS 'https://agent402.tools/api/index?seller=agents.samedaydesk.com'

# actual logic (clone, do not commit)
# healthScore / isRoutable / paywall 402-only / priceConflict:
#   Agent402/src/x402-index.js
# OpenAPI paid inclusion:
#   normaliseOpenapiTools + openapiOperationHasPaymentSignal

curl -sS -X POST https://agent402.tools/api/route \
  -H 'content-type: application/json' \
  -d '{"query":"samedaydesk extract url markdown","top":20,"include":"external"}'
```

Bounded output: [`evidence/agent402-seller-bounded.json`](evidence/agent402-seller-bounded.json).

Seller: health `1`, routable `true`, paidToolCount `25`, paywall 402 on `/extract` with MPP, GET `/read` `priceConflict: true` (`bazaar: 0.05`, `origin: 0.005`).

## 4. AgentCash discovery from public OpenAPI

```bash
cd /tmp/lqdist1-scratch
npx --yes @agentcash/discovery@1.7.5 discover https://agents.samedaydesk.com --json
npx --yes @agentcash/discovery@1.7.5 check https://agents.samedaydesk.com/extract --json
npx --yes @agentcash/discovery@1.7.5 check https://agents.samedaydesk.com/security/wallet-policy-conformance --json
```

Bounded output: [`evidence/agentcash-discover-bounded.json`](evidence/agentcash-discover-bounded.json).

`discover` found the origin, listed all 25 paid operations, and emitted no OpenAPI/L2 warnings.

## 5. Unpaid 402 term probes (no payment)

Constructible OpenAPI examples:

```bash
curl -sS -D - 'https://agents.samedaydesk.com/extract?url=https://example.com'
curl -sS -D - 'https://agents.samedaydesk.com/read?url=https://example.com'
curl -sS -D - 'https://agents.samedaydesk.com/commerce/contract-qualified-search?query=service%20domain%20ownership%20code%20provenance&requiredPaths=data.sourceRepository'
curl -sS -D - 'https://agents.samedaydesk.com/distribution/agent-discoverability-audit?origin=https%3A%2F%2Fagents.samedaydesk.com&intent=extract%20a%20public%20web%20page%20into%20structured%20JSON%20metadata%20headings%20links%20and%20JSON-LD'
curl -sS -D - 'https://agents.samedaydesk.com/gateway/commerce/payment-offer-preflight?url=https%3A%2F%2Fagents.samedaydesk.com%2Fdefi%2Fmorpho-position%3Faddress%3D0x8ee9c15c3e5332cbc6ef39a2bb036c63c6549b6e'
```

Empty-body AgentCash-style POSTs:

```bash
curl -sS -D - -X POST https://agents.samedaydesk.com/work/opportunity-preflight \
  -H 'content-type: application/json' -d '{}'
curl -sS -D - -X POST https://agents.samedaydesk.com/security/wallet-policy-conformance \
  -H 'content-type: application/json' -d '{}'
curl -sS -D - -X POST https://agents.samedaydesk.com/security/stateful-wallet-policy-conformance \
  -H 'content-type: application/json' -d '{}'
```

Schema-valid wallet POSTs (still unpaid):

```bash
curl -sS -D - -X POST https://agents.samedaydesk.com/security/wallet-policy-conformance \
  -H 'content-type: application/json' \
  -d '{"profileId":"probe","provider":"probe","network":"eip155:8453","protocol":"x402","observations":[{"case":"intended","actual":"denied","denialClass":"policy"}]}'
curl -sS -D - -X POST https://agents.samedaydesk.com/security/stateful-wallet-policy-conformance \
  -H 'content-type: application/json' \
  -d '{"profileId":"probe","provider":"probe","network":"eip155:8453","protocol":"x402","observations":[{"case":"first_within_cap","actual":"allowed","enforcementClass":"none"}]}'
```

Follow-up bounded results: [`evidence/followup-probes.json`](evidence/followup-probes.json).

## Offline verify

```bash
npm run test:lqdist1
```
