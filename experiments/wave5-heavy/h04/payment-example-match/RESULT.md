# RESULT — GET /extract paid-success vs published demos

Production evidence pin: `a143898dd1ec35c097ca7eb0b472f30dad1ee319` (0.005 USDC each). Framer reproduced from that pin. No live payment.

## Observed digests

| Label | SHA-256 request digest | Dates (Root-joined) |
| --- | --- | --- |
| triple | `2f7eb0c0de992712235554d87055c72386555b312017623406340683d237a670` | Sep 8 / 9 / 11 (three purchases, same digest) |
| fourth | `6312daa4489344e3d144e25ba53da4940279e96492dd6a85316dff1802d962ad` | Sep 11 |

## Corpus

Eleven finite published GET `/extract` candidates (three distinct targets after encoding):

| Target | Digest vs observed |
| --- | --- |
| `/extract?url=https%3A%2F%2Fexample.com` | **equals triple** |
| `/extract?url=https://example.com` | neither |
| `/extract` (no query) | neither |

Sources: x402 manifest resource URL, merchant `examples/customer-x402/README.md` preflight, SDS `llms.txt`, lqdist1 curl, buyer-runtime / Coinbase / Agent402 construct fixtures, presence x402 catalog, AgentCash `check` path-only, Agent402 paywall URL.

Skill docs that only show `<url-encoded-https-url>` placeholders are **not** concrete requests and were excluded.

## Controls

- Same method/target/empty body repeats.
- One-byte target flip and one-byte body flip change the digest.
- Absolute origin+path as target does **not** match (framer uses path+query).

## Interpretation

**Triple:** exact match to the publicly advertised **percent-encoded** `example.com` demo (`/extract?url=https%3A%2F%2Fexample.com`). Three of four paid-success rows share those input bytes. That is **not** a named user, not independence, and not a usefulness proof.

**Fourth:** no match in this finite public corpus → **unresolved**.

Unencoded `https://example.com` (llms.txt / curl) is a different published string and does **not** hash to either observed digest.

## Product implication

Published demo bytes **do** dominate the repeated digest. Treat those three purchases as **sample/benchmark/demo traffic**, not organic product demand. Improve published supplied-input examples (caller-owned URLs, encoded exactly as clients will send) and ask for useful-result feedback **without manufacturing organic revenue**.

Do not invent a “no public traffic” claim for the unmatched fourth digest. Next **first-party** measurement is **D17** (already in the Wave5 plan), not new broad surveillance.
