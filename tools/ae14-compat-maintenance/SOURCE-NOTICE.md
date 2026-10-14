# Source notice

The per-capture fee is integer division `floor(capture * 500 / 10000)` on each
capture. The rule is the public commerce-payments fee note:

- repository: https://github.com/base/commerce-payments
- commit: `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`
- path: `docs/Fees.md`
- license: MIT
- copyright: Copyright (c) 2025 Coinbase

No Solidity, contract code, or other file bytes from that repository are copied.
A sum of per-capture fees is not replaced by the fee of the summed gross.

`tools/recurring-job-recipes/` and `tools/result-reuse/` are consumed in place
from this SameDayDesk checkout. They are not rewritten.

E01, E02, and E06 are consumed as receipt heads recorded in `PINS.json`. Their
trees are not vendored.
