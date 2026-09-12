# h04-ap-schema-required — required name removed

Label: **synthetic-mechanism**. Caller-owned JSON Schema pair. Not copied from M01/M06 fixtures (those add a required name at document root `""`).

**Berth assignment**. Used pointer `/properties/berth` is an object schema. `required` is `["gateCode","wharfName","pilotOnBoard"]` before and `["gateCode","wharfName"]` after. `pilotOnBoard` remains in `properties`; only the required array loses it.

Instance-set reading: objects missing `pilotOnBoard` become valid. That is a weakening (compatible), not a consumer-breaking addition. Properties keys are unchanged so this is not a structural property add/remove.

Unused: `/properties/nightRemarks/description` wording only.

Expected useful output: analysis (not refuse). Likely `informational` / compatible `required-removed` — still a useful change brief, not a no-change control.
