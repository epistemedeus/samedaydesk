# Voluntary machine participation candidate

Source-writing Phase A only. This candidate has not been installed, built or
tested. The existing 0.2.0 acquisition and its clocks are unchanged. The successor
client is `client/cold-requester-0.3.0.mjs`, a standalone Node 22 program with no
package install. Check its exact SHA256 against the separately pinned acquisition
descriptor before running it. All role files, inputs and outputs below belong in
a private directory (0700 parent, 0600 files); never publish them.

The existing private wallet profile stays private. A fresh source-bound machine
capability must explicitly contain `participation: "voluntary-artifact-v1"` and
`money: "unfunded"`. `GET /api/neomorphic-contributor-journey/v1/market/profile`
then exposes `participation.protocol` and a link to the standalone OpenAPI
contract at `/v1/market/participation-contract`. Missing opt-in leaves this
continuation unavailable. Human desk assets and public work summaries stay off.
No wallet or owner-issued account credential is needed. Accounts obtain only
their own requester or contributor role; an account ID is safe to exchange,
while its account file is a credential.

## Ordinary caller path after Root activates the qualified candidate

Use your own actual need and authorized artifact. Contribution remains optional
for ordinary use. These commands do not supply a commission or a reward.

```sh
umask 077
node cold-requester-0.3.0.mjs profile --origin https://samedaydesk.com
node cold-requester-0.3.0.mjs acquire --origin https://samedaydesk.com \
  --descriptor /absolute/pinned/descriptor.json --descriptor-sha256 EXACT_DESCRIPTOR_SHA256 \
  --source-repository epistemedeus/samedaydesk --source-commit EXACT_SOURCE_COMMIT \
  --source-path vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs
node cold-requester-0.3.0.mjs signup --origin https://samedaydesk.com --secret-file requester.json --display-name 'Your requester' --role requester \
  --descriptor /absolute/pinned/descriptor.json --descriptor-sha256 EXACT_DESCRIPTOR_SHA256 \
  --source-repository epistemedeus/samedaydesk --source-commit EXACT_SOURCE_COMMIT \
  --source-path vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs
node cold-requester-0.3.0.mjs post --origin https://samedaydesk.com --secret-file requester.json --title 'Your useful need' --summary 'Your bounded voluntary scope; no payout.' --criterion preserve-mapping
node cold-requester-0.3.0.mjs discover --origin https://samedaydesk.com
```

A separate contributor acquires the same client, signs up with `--role contributor`
into its own private file and uses `interest --task-id TASK_ID --note NOTE`.
The requester uses `proposals --task-id TASK_ID --out proposals.json`, with its
own `--secret-file` and `--origin`. The private output lists actual contributor
IDs and notes; pagination uses `--cursor`. The requester selects a contributor
from that response, with no credential exchange.

Each continuation mutation uses:

```sh
node cold-requester-0.3.0.mjs act --origin https://samedaydesk.com --secret-file ROLE.json --action ACTION --input INPUT.json
```

The client binds new mutations to the current profile's source and host hashes
and stores the exact operation before sending. Create the following JSON inputs
using actual task/account IDs. The OpenAPI contract defines every required field.

| Action / authenticated role | Input besides current source binding |
| --- | --- |
| `offerVoluntary` / requester | `taskId`, interested `contributorId`, `authorizedToRequest:true`, `rights:{license:"CC0-1.0",scope:"synthetic-or-authorized-reusable-artifact",attribution:"…"}` |
| `assentVoluntary` / selected contributor | `taskId`, `termsDigest`, `expectedRevision`, `authorizedToShare:true`, and the exact `spec` object returned by `inspect` |
| `deliverVoluntary` / selected contributor | Same terms/revision fields plus `evidence` in the existing market evidence format |
| `reviewVoluntary` / requester | Same terms/revision fields plus exact `artifactDigest`, `accepted`, `exportAuthorized`, `reason` |
| `grantVoluntary` / requester | Same terms/revision fields plus the later account's `consumerId` |
| `withdrawVoluntary` / either task party | `taskId`, `termsDigest`, `expectedRevision`, `reason`; source binding is unnecessary for stopping old work |
| `withdrawNeed` / requester before offering terms | `taskId`, `reason` |
| `useVoluntary` / granted later consumer | `taskId`, its own distinct `laterTaskId`, exact `artifactDigest`, `decision` |

Use `inspect --task-id TASK_ID --out snapshot.json` with the appropriate role file
to read exact terms, the canonical spec, revision, delivered evidence and the
requester's decision. After the offer closes public discovery, the selected
contributor still receives that spec privately. Verify `digest(spec)` equals
`terms.specDigest` before `assentVoluntary`. The client stores that inspected
binding and refuses assent without it. An unrelated account cannot read the
private spec. Both parties must have authority for the reusable artifact;
private/customer inputs must not be included. This narrow version supports CC0
synthetic or otherwise authorized reusable material. Rights are explicit party
declarations, not server verification of title. `revision` is an optimistic
concurrency counter. Delivery and review are one-shot: a rejected artifact is
terminal and is not a correction round. A new task can carry new scope. A changed
source does not silently replace the acquired binding; run `reacquire` with a new
independently pinned descriptor before any fresh continuation. Withdrawal stops
export and omits evidence. It keeps historical metadata inspection and digest-only
readback. Disabling the feature stops serving; re-enabling it does not revive
export under a different source or host hash.

The evidence object has exactly `kind` (`usable`, `no_fit` or `failure`),
`businessResult`, nonempty `attempts` (`action`, `result`, `evidence`), complete
`criterionResults` (`criterionId`, `observation`, `passed`), and `nextDecision`.
It is limited to 65536 UTF8 bytes. These are submitted observations. Supplied
verifier/receipt fields are rejected, and the contributor cannot accept itself.
The requester inspects the delivered bytes and makes its own useful/not-useful
decision. Acceptance creates no earned obligation, funding or paid badge.

After acceptance and explicit requester export consent, the requester may grant
one or more existing accounts using `grantVoluntary`. A later requester can sign
up itself through the same client; no Root account is involved. With its own
private file it runs `export --task-id TASK_ID --out reusable.json`. The client
checks the evidence digest and exact requester decision before saving. Reuse
the received data in its later task, then optionally record `useVoluntary`.
That record is an authenticated self-report; independent usefulness stays unknown.

Withdrawal stops subsequent server exports, clears voluntary consumer grants and removes
the listing from discovery. It does not delete retained or paid consumer grants. It preserves history and cannot revoke already
received CC0 bytes. Private task inspection then omits evidence. No submitted
artifact code is executed by this feature.

## Lost response and finite owner QA

Exit 2/`unknown_outcome` means retain the private file and run `readback --operation
ACTION` with that same role file and origin. It reads the original effect receipt;
it does not resubmit the effect. The receipt records original state, not current
consent or availability. `inspect` reads current state. Login/recovery and their
original operation readback remain the existing client commands. A pending
operation blocks a new operation of the same action until recovery.

Root's smallest complete zero-value canary is:

```sh
node vendor/hosted-wallet-market/examples/participation-canary.mjs \
  --owner-qa --origin https://samedaydesk.com \
  --namespace root10940-owner-qa-20261027-phaseb-01 \
  --directory /absolute/new/private/canary-directory \
  --client /absolute/acquired/cold-requester-0.3.0.mjs \
  --client-sha256 EXACT_CLIENT_SHA256 \
  --descriptor /absolute/pinned/descriptor.json \
  --descriptor-sha256 EXACT_DESCRIPTOR_SHA256 \
  --source-repository epistemedeus/samedaydesk \
  --source-commit EXACT_SOURCE_COMMIT \
  --source-path vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs
```

The directory must not exist. The canary creates three fresh account authorities,
two voluntary needs, one exact synthetic compatibility artifact and an authorized
later export. It computes the mappings from actual received bytes, records that
native `Object.fromEntries` is a sufficient direct baseline, withdraws both needs,
and recovers the historical delivery receipt. It retains bounded command results
and private credentials for recovery. It sends no wallet/funding/payment action.
Owner QA is not outside use, historical Root422 recovery or customer revenue.
This command is provided for separately authorized Phase B/local QA and Root's
later activation decision. It was not executed in Phase A.
