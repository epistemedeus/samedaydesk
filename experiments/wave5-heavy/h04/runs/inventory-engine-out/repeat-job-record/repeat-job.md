# Repeat job record (operator-schedulable, not a daemon)

Status: **actionable**
Identity verified: **true**
Verification state: **verified**

Verified repeat-job record for family pricing-row-unit

Family: `pricing-row-unit`
Schedule hint: `manual-operator`
Daemon: **false**
Manifest digest: `54b64ffcbbdc4ef6d31eff41df6ed5c44a9448be824be3821dcf5ef2d4e778bf`

## Inputs
- before: ../../pricing/a/before.json
- after: ../../pricing/a/after.json
- before.declared.sha256: 93a88b9a585a72927c6de66f22aef60cbe5dcf8f7b37096a33f577e8321614b6
- after.declared.sha256: 9fa7f018ae0fc07e70baca7e039758300de35400c89fc099590dc74a4306c3b6
- before.verified.sha256: 93a88b9a585a72927c6de66f22aef60cbe5dcf8f7b37096a33f577e8321614b6
- after.verified.sha256: 9fa7f018ae0fc07e70baca7e039758300de35400c89fc099590dc74a4306c3b6

## Operator steps
- Re-run with changed local before/after artifacts using the same family.
- Do not start a background scheduler from this record.
- Preserve refused/partial flags from the underlying compare.
- Declared sha256 values are verified only when local file bytes match; otherwise the record is informational/unverified.

_Schema-validated next-run sample or caller input. Local byte verification required for verified identity. Not customer demand proof._
