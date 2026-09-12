# Payment-example-match (H04)

**Question:** Do the four real GET `/extract` paid-success request digests match any **exact publicly advertised demo request**?

This is about whether repeat purchases should be read as **sample/benchmark traffic**, not a new product feature.

## Limits

- Offline. No paid live requests. No credentials. No wallet inference.
- Finite published corpus only. No private URL guessing or dictionary brute-force.
- A digest match proves **byte identity with that published example**, not who paid, independence, discovery path, or usefulness.
- A non-match stays **unresolved**, not “no public traffic”.
- H02 already found no exact buyer identity — not repeated here.

## Framer (merchant pin `a143898dd1ec35c097ca7eb0b472f30dad1ee319`)

`commerce-events.mjs` `paidEvidenceRequestDigest`:

1. SHA-256
2. domain `samedaydesk.commerce-paid-success-evidence.request.v1\0`
3. length-framed (8-byte big-endian length + bytes) **method**, **target**, **rawBody**
4. target = `req.originalUrl` if string else `req.url` (**path+query**, not origin)
5. empty GET body → `Buffer.alloc(0)` when rawBody is known empty

Percent-encoding is part of the target bytes. Published `https%3A%2F%2Fexample.com` and `https://example.com` are **different** digests.

## Run

```bash
cd experiments/wave5-heavy/h04/payment-example-match
node replay.mjs
node --test test/*.test.mjs
```
