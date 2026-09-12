# Caller input provenance

`before.json` and `after.json` were authored by the CW69 owner for an offline
consumer acceptance, before the quota-reset handoff. They are synthetic caller
inputs, not the SDS52 or engine journey sample files and not customer activity.

One dependency changes from 2.1.0 to 2.2.0 with changed integrity and resolved
fields. The package names and URLs are inert comparison data; no npm registry
lookup, install, purchase, or audit was performed. No engine output is claimed
yet. `evidence/remote/lockfile-request.json` preserves the exact combined body
used for an unpaid 402 challenge; its digest is in the capture metadata.
