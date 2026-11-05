# Accepted work commands 0.3.1

Use these commands with `cold-requester.mjs` 0.3.1 and the secret file that client already wrote. Node 22 is required. Passwords, cookies, tokens, and source hashes stay in files. The entry names the client, the descriptor, `accepted-work.mjs`, `prepare-accepted-work.mjs`, and this guide. Check each sha256 and byte length from the entry before you run a command. `hostedAcquisitionVerified` on that entry stays false.

## Acquire

Run `acquisition.command` from the entry. Point `--origin` at the market origin on the entry and point `--descriptor` at the descriptor file named there.

This command is the current projection for binding 45e1c3fc after a matching installation receipt. The measured source and host hashes equal that descriptor's requiredProfile. Rollback restores the predecessor projection for binding e32c3f2c through the same transition. Hosted acquisition is not verified. This source does not claim the public route is live.

```sh
node cold-requester.mjs acquire --origin https://samedaydesk.com --descriptor descriptor.json --descriptor-sha256 de60c5132911c0a27823f193ff100ffd3b832f56def9b9f5cfb32447ec2fd6ad --source-repository epistemedeus/neomorphic-io --source-commit b79f985e83e829288a675407a4b4124e58a11f3a --source-path clients/cold-requester-0.3.1.mjs
```

The command checks the live profile against that descriptor. A changed source or host returns `acquisition_reacquire_required` on a later command. Reacquire with this same client and the pins on that entry.

## Prepare a permit

Copy `termsDigest` and `artifactDigest` from the received 0.3.1 receipt. Copy the received `rights` object into `rights.json`. Write `summary.txt` as the exact summary bytes. Write `public-artifact.json` as the public artifact object. Write `consent.json` yourself as `{"publicationConsent":true}`. The acceptance receipt does not supply this file, and this command does not choose a contributor.

The requester permit and the contributor permit are two files. Prepare the requester file with the revision on the acceptance receipt.

```sh
umask 077
node prepare-accepted-work.mjs --task-id market-REPLACE --terms-digest REPLACE --artifact-digest REPLACE --expected-revision REPLACE --summary-file summary.txt --artifact-file public-artifact.json --rights-file rights.json --consent-file consent.json --out permit-requester.json
```

`permit-requester.json` is the body the requester `permit` reads. Preparation does not post it.

## Permit

Run the requester permit once and save its JSON. The permit result includes `revision`. A successful permit stores the next revision. Prepare the contributor file with that returned revision and the same task, terms digest, artifact digest, summary, public artifact, rights, and consent. Write it to `permit-contributor.json`. Do not reuse `permit-requester.json`.

```sh
node accepted-work.mjs permit --origin https://samedaydesk.com --secret-file requester.secret --input permit-requester.json > permit-requester-result.json
node prepare-accepted-work.mjs --task-id market-REPLACE --terms-digest REPLACE --artifact-digest REPLACE --expected-revision "$(node --input-type=module -e 'import fs from "node:fs"; process.stdout.write(String(JSON.parse(fs.readFileSync("permit-requester-result.json","utf8")).revision))')" --summary-file summary.txt --artifact-file public-artifact.json --rights-file rights.json --consent-file consent.json --out permit-contributor.json
node accepted-work.mjs permit --origin https://samedaydesk.com --secret-file contributor.secret --input permit-contributor.json
```

The public page shows the artifact after both parties permit those bodies. One party, a consent file other than `{"publicationConsent":true}`, or a stale terms or artifact digest leaves that page unchanged.

## Anonymous retrieval and a changed input

No secret file is required.

```sh
node accepted-work.mjs discover-accepted --origin https://samedaydesk.com
node accepted-work.mjs detail --origin https://samedaydesk.com --task-id market-REPLACE
node accepted-work.mjs artifact --origin https://samedaydesk.com --task-id market-REPLACE > artifact.json
```

`discover-accepted` returns `items`. An empty `items` array means the page has no published artifact. `artifact.json` holds the public artifact on `value.publicArtifact`. Apply its mapping to your own input. One mapping is `external_id` to `id`. The input `{"external_id":"changed-row-17"}` becomes `{"id":"changed-row-17"}`.

```sh
node --input-type=module -e 'import fs from "node:fs"; const artifact=JSON.parse(fs.readFileSync("artifact.json","utf8")).value.publicArtifact; const input={external_id:"changed-row-17"}; const out={}; for (const column of artifact.mapping) out[column.to]=input[column.from]; fs.writeFileSync("changed-input.json", JSON.stringify(out)+"\n");'
```

Use your own input. Keep private fields, credentials, and another tenant's rows in your own files. The cold client's `profile` command is a filtered projection. It omits `acceptedWork`, including when the route is on. Read the route with `discover-accepted`. HTTP 404 means the route is off. HTTP 200 with an `items` array, including an empty array, means the route answered. The raw market profile is a separate response and includes `acceptedWork` when the route is on. The response fields `publicReads` and `paidWork` report the profile decision for that request. The whole request uses one deadline of 20 seconds. Received bytes do not extend it. Exit 2 with code `unknown_outcome` means the response was lost. Do not send that request again.

## Same-account continuation

The requester account that permitted can grant one later consumer. Write `grant.json` with `taskId`, `termsDigest`, `expectedRevision`, and `consumerId`. Leave `sourceSha256` and `hostSha256` out of the file. The 0.3.1 client copies them from the acquired profile.

```sh
node cold-requester.mjs act --origin https://samedaydesk.com --secret-file requester.secret --action grantVoluntary --input grant.json
node cold-requester.mjs export --origin https://samedaydesk.com --secret-file later.secret --task-id market-REPLACE --out later-export.json
```

`later-export.json` is the permissioned private artifact for that account. The anonymous page remains the public artifact.

## Withdrawal

Write `withdraw.json` with `taskId`, `termsDigest`, `expectedRevision`, and `reason`.

```sh
node accepted-work.mjs withdraw-publication --origin https://samedaydesk.com --secret-file requester.secret --input withdraw.json
```

Withdrawal stops future served exposure. A copy already obtained stays with the party that received it.

## Lost response

If permit or withdrawal exits 2 with `unknown_outcome` or `operation_readback_required`, do not POST again.

```sh
node accepted-work.mjs readback --origin https://samedaydesk.com --secret-file requester.secret --operation permitAcceptedWork
node accepted-work.mjs readback --origin https://samedaydesk.com --secret-file contributor.secret --operation withdrawAcceptedWork
```

Readback returns the stored receipt for that operation and does not repeat it.
