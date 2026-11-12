# Cloud import receipts

Template for evidence when an operator imports a kit into Make or n8n Cloud, reads it
back, and cleans it up. Nothing has been imported from this package by its authors:
every receipt below is unfilled. Fill a field only with a value observed during the
import; leave `TBD` otherwise. Times are ISO 8601 with an explicit offset or `Z`.

Compute the file hash on the exact bytes imported:

```sh
sha256sum make/record-to-accepted-output.blueprint.json n8n/record-to-accepted-output.workflow.json
```

If the file was edited before import (for example to point `clientEndpoint` at a real
endpoint), hash the edited file, record that hash, and describe the edit.

## Receipt: Make

| Field | Value |
| --- | --- |
| Platform | Make (cloud) |
| Account / organization / team | TBD |
| Zone (e.g. eu1, us1) | TBD |
| Kit commit (`git rev-parse HEAD`) | TBD |
| File imported | `make/record-to-accepted-output.blueprint.json` |
| File sha256 (bytes imported) | TBD |
| Edits before import | TBD (none / describe) |
| Import time | TBD |
| Operator | TBD |
| Scenario id | TBD |
| Scenario URL | TBD |

### Readback

| Field | Value |
| --- | --- |
| Readback time | TBD |
| Scenario name | TBD |
| Active / scheduling state | TBD |
| Module count (read back) | TBD |
| Module count (expected, from blueprint) | TBD |
| Import warnings or errors | TBD (none / verbatim text) |
| Connections or credentials attached | TBD (expected: none) |

### Cleanup

| Field | Value |
| --- | --- |
| Cleanup action | TBD (deleted / deactivated) |
| Cleanup time | TBD |
| Confirmation (readback after cleanup, e.g. 404 or absent from list) | TBD |

## Receipt: n8n Cloud

| Field | Value |
| --- | --- |
| Platform | n8n Cloud |
| Instance / workspace / project | TBD |
| n8n version (instance) | TBD |
| Kit commit (`git rev-parse HEAD`) | TBD |
| File imported | `n8n/record-to-accepted-output.workflow.json` |
| File sha256 (bytes imported) | TBD |
| Edits before import | TBD (none / describe) |
| Import time | TBD |
| Operator | TBD |
| Workflow id | TBD |
| Workflow URL | TBD |

### Readback

| Field | Value |
| --- | --- |
| Readback time | TBD |
| Workflow name | TBD |
| Active state | TBD |
| Node count (read back) | TBD |
| Node count (expected, from workflow JSON) | TBD |
| Import warnings or errors | TBD (none / verbatim text) |
| Credentials attached | TBD (expected: none) |

### Cleanup

| Field | Value |
| --- | --- |
| Cleanup action | TBD (deleted / archived / deactivated) |
| Cleanup time | TBD |
| Confirmation (readback after cleanup, e.g. 404 or absent from list) | TBD |

## Notes

Cloud import needs the operator's explicit go-ahead. The receipts record what was
observed; they do not change acceptance, which stays with the client endpoint and the
vendored journey.
