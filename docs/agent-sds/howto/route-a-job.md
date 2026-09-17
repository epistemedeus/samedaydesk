# How to route a job to an existing SDS offer

Use the local matrix when the job is known. Routing never pays, never evaluates
acceptance criteria, and never sets `executionAuthorized: true`.

## Supported SDS example

```bash
node tools/offer-routing/route-job.mjs docs/agent-sds/fixtures/free-discovery.job.json
```
<!-- follow-expect {"exit":0,"json":{"ok":true,"paid":false,"selected.offerId":"sdd.cold_read_discovery"}} -->

`free_discovery` with `no_payment` selects `sdd.cold_read_discovery`.

Page-change of already-held snapshots selects `sdd.page_change_offline`:

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
```
<!-- follow-expect {"exit":0,"json":{"ok":true,"paid":false,"selected.offerId":"sdd.page_change_offline"}} -->

## Unsupported acquisition (job type refused)

A complete public GitHub issue discussion is not an SDS offer. Route the
in-repo fixture. Expect exit 2, `ok: false`, `selected: null`, and
`complete_issue_acquisition_unavailable`.

```text
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json
```

Do not recover by calling paid HTML extract, composing a historical fixture as
if it were current comments, or following a Neomorphic archive. Obtain issue
body and paginated comments from the official GitHub API, or process
already-held evidence as `supplied_issue_brief`. This doc set does not run
Neomorphic `agent-task-kit`.

## Constraints that matter

- `no_payment` / `offline_only` drop live paid HTTP offers.
- `offline_preferred` ranks `offline_local` and fixture cold-read above paid
  extract.
- `paymentRequired: true` on a route result means a *later* caller decision,
  not that this runner charged.

Print the matrix without selecting:

```bash
node tools/offer-routing/route-job.mjs --matrix
```
<!-- follow-expect {"exit":0,"json":{"schema":"samedaydesk.offer-capability-limits.v1"}} -->

SDS-owned offer ids start with `sdd.`. Ids that start with `neo.` are named
for honesty. They are not execution targets of this doc set.
