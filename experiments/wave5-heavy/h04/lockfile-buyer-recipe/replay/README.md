# Independent replay

Mounted-merchant proofs live in `test/mounted-harness.test.mjs`.

```bash
cd experiments/wave5-heavy/h04/lockfile-buyer-recipe
MERCHANT_ROOT=/tmp/w5-h04/merchant-ca38205 npm test
```

Harness properties:

- Actual current merchant `server.js` at pin `ca38205`
- Injectable fake facilitator (`/supported`, `/verify`, `/settle`)
- Throwaway `viem` test signer (`generatePrivateKey`)
- Cases: useful change, no-change, timeout/unknown, replay-negative

No live payment. `PUBLIC_URL` stays `https://agents.samedaydesk.com` so
the challenge resource matches authorization; the client fetchImpl remaps
that origin to `127.0.0.1`.
