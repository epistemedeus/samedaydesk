# h04-ap-schema-numeric — exclusiveMinimum 0.5 → 1.0

Label: **synthetic-mechanism**. Caller-owned JSON Schema pair. Not a public revision. Not copied from M01/M06 engine fixtures. Distinct from `h04-schema-01` (that pair is Draft-04 boolean `exclusiveMinimum` → Draft-06 number *type*, not a numeric bound edit).

Quay **crane load sample**. Used pointer `/properties/tonnes` has `exclusiveMinimum` `0.5` before and `1.0` after (JSON number; parsers collapse `1.0` to integer `1`).

Instance-set reading: values in `(0.5, 1.0]` were valid and become invalid. That is a tightened exclusive lower bound, including the non-integer `0.5` start.

Unused: `/properties/operatorMemo/description` wording only.

Expected useful output: analysis (not refuse). Likely `actionable` / breaking `numeric-tightened`.
