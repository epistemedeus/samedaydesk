# W5-D06 RECEIPT

Co09 delivery outbox with precise destination and terms mapping.

- **Repo:** epistemedeus/samedaydesk
- **Branch:** cursor/w5-d06-co09-delivery-outbox-with-precise-destination-and-terms-mapping-4f5e
- **Starting ref:** 828d8942fb1631aba92a9116dc9fbde0ee1dd258
- **Owned:** tools/job-delivery-outbox/, experiments/wave5/d06/RECEIPT.md
- **Tested wrapper:** SDS52 aeef964fa188443078958d9d6d393afae1d542ee receipt.v1
- **D01 binding:** not published; do not claim future sibling behavior

Source-predicted defects reproduced and fixed: wrong callback path is a distinct destination; asserted digest mismatch refuses; missing engine identity refuses (kit pin not invented); ack without matching path/digest is not delivered; lost HTTP ack stays unknown. Unlike terms hashes remain unequal.

Tests: `cd tools/job-delivery-outbox && npm install && node --test --test-concurrency=1 test/*.test.mjs` (CLI, two-process HTTP, SDS52 CLI receipt, disposable Postgres 16). No skipped gates.
