# Child 02 — M-SDS-F08 SAMPLE/`--example` reserved-fixture funding

Pack-local reproduction + reject-as-not-a-sale. Not a second F08 product.
This H4R tree has **no** `server/paid-useful-jobs/`. Do not invent a sale.
Fixture cannot become `provenance=customer`.

Quoted from `origin/fable/f08-paid-wrappers` (`bae3e7cd5034b21019fb272a99d88db964b831ee`).
Draft PR 52 was left draft and is not merged onto this tree.

## sample-guard (`git show origin/fable/f08-paid-wrappers:server/paid-useful-jobs/lib/sample-guard.mjs`)

```
/**
 * Detect SAMPLE / --example inputs. Caller-supplied copies without markers
 * are not treated as samples even if they happen to share bytes with a kit fixture.
 */
export function inspectSample(request, { kitRoot = null } = {}) {
  const reasons = [];
  if (request?.example === true || request?.example === "true") {
    reasons.push("example-flag");
  }
```

Sibling SAMPLE markers on that branch:

```
function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n)) || null;
}
```

## classifyFunding SAMPLE branch (`git show origin/fable/f08-paid-wrappers:server/paid-useful-jobs/lib/funding.mjs`)

`isSaleLikeFunding` includes reserved-fixture (this is the post-reviewer fix):

```
function isSaleLikeFunding(request, { payment, intent, settleRequested }) {
  return (
    intent === "live-sale" ||
    intent === "sale" ||
    intent === "reserved-fixture" ||
    settleRequested ||
    request?.sold === true ||
    Boolean(payment)
  );
}
```

SAMPLE + sale-like funding is rejected, not reserved:

```
  // SAMPLE / --example / kit SAMPLE provenance cannot reserve fixture funds or
  // be treated as a sale. Unfunded labeled sample output remains allowed.
  if (sample && isSaleLikeFunding(request, { payment, intent, settleRequested })) {
    return {
      fundingState: "rejected",
      sold: false,
      code: "sample-not-a-sale",
      message: "SAMPLE/--example inputs produce labeled sample output and cannot be treated as a paid sale",
    };
  }
```

Commit `95d9d21869717e26c80d17cee3933a0350aeee1e` message: "SAMPLE/--example, kit SAMPLE paths, and SAMPLE-labelled copies were able to complete with fundingState reserved-fixture. sold stayed false, but that still treated sample provenance as a paid reservation. Reject those as sample-not-a-sale."

## RECEIPT-REVIEW gap (`git show origin/fable/f08-paid-wrappers:server/paid-useful-jobs/RECEIPT-REVIEW.md`)

```
**Branch:** `fable/f08-paid-wrappers`
**Draft PR:** [sds#52](https://github.com/epistemedeus/samedaydesk/pull/52) (left draft; not merged)
**Owned directory:** `server/paid-useful-jobs/`
```

```
Wave-1 SDS boundary receipt was incomplete: the first reviewer moved PR 52 from `b4af5a25` to `95d9d218` after noting SAMPLE/`--example` still received `reserved-fixture` funding, then did not land `RECEIPT-REVIEW.md`. This run finished that receipt and re-checked the follow-up.

First-reviewer commit `95d9d218` does reject SAMPLE provenance as a reserved-fixture sale. Verified by tests and CLI (below). `sold` was already false; the gap was treating sample provenance as a paid reservation.
```

CLI evidence on that branch (not this tree): `--example --funding reserved-fixture` exits 2, `code: sample-not-a-sale`, `fundingState: rejected`, `sold: false`.

## This H4R tree

`server/paid-useful-jobs` is absent:

```
ls: cannot access '/workspace/server/paid-useful-jobs': No such file or directory
```

`RECEIPT-REVIEW.md` exists on `fable/f08-paid-wrappers` and is not on this tree.
MONITOR gap here: SAMPLE/`--example` still conceptually gets reserved-fixture funding.

Pack-local wrapper (`src/f08-sample-funding.ts`):

- `reproduceSampleReservedFunding` returns the unguarded classification `reserved-fixture` for SAMPLE/`--example`/fixture + reserved-fixture funding (`saleState: not_a_sale`, `liveProductPresent: false`).
- `rejectSampleFundingAsNotASale` fail-closes with `fundingState: rejected`, `code: sample-not-a-sale`, `provenance: fixture`. Promoting a fixture to customer/sale uses `FIXTURE_BECOMES_SALE`.
- Caller-looking payloads without SAMPLE markers can still be classified as reserved-fixture on the unguarded path; they cannot become `provenance=customer`.

Do not copy F08 engines. Do not create `server/paid-useful-jobs/`. Do not invent a sale.
