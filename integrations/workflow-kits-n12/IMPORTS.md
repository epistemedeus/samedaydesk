# Cloud import receipts

Evidence from cloud import, readback and cleanup of the kits in this package.
Times are ISO 8601 with an explicit offset or `Z`.

Import acceptance means the workflow was imported, read back and deleted. It is
not an executed hosted workflow, and it is not paid or commercial acceptance.

Compute the file hash on the exact bytes imported:

```sh
sha256sum make/record-to-accepted-output.blueprint.json n8n/record-to-accepted-output.workflow.json
```

If the file was edited before import (for example to point `clientEndpoint` at a real
endpoint), hash the edited file, record that hash, and describe the edit.

## n8n Cloud QA import, received

Source: kit `783f0841d56a44acd4dcce1b5a29a5060e04824b`,
`integrations/workflow-kits-n12/n8n/record-to-accepted-output.workflow.json`,
119262 bytes, raw sha256
`4a7d556b9720a64637bb1811b48284035a37a2f063961d7351559bdba694362b`.

Create: API CREATE 200 at 2026-11-12T11:24:30.213Z, workflow id `0ouvpy0FyuZ1WkIe`.
The body was the QA name plus only the documented writable fields (`name`,
`nodes`, `connections`, `settings`; `pinData` omitted).

Readback: GET 200, 15 nodes, `active` false, no credentials, node content and
connections exact after normalizing server-added fields.

Cleanup: DELETE 200, then GET 404, finished at 2026-11-12T11:24:34.609Z.

Auth: the existing indexed key, read through the existing Keyway getter. No key
was copied or printed.

Custody: `id/ae90-root-coordination/N12-N8N-QA-IMPORT/{SOURCE,REQUEST,CREATE,READBACK,DELETE,AFTER_DELETE,RECEIPT}.json`.

Nothing was executed.

## Make

No hosted import yet. The existing Make session is expired, and the Google
sign-in for that account needs a phone approval, which is a physical factor.
Nothing was created in Make, so there is nothing to clean up. A route through
an existing session is being checked.

## VM receipt

Frozen kit `783f0841` passed all 3 producer `--check` commands and 113/113 node tests
(0 failed, 0 skipped) on Node 22.23.4. This was Root VM2, and the logs and RECEIPT
are at `/home/ubuntu/n12-root-vm2-second-1124`.
