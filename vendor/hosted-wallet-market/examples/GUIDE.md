# Post an unfunded request

Open a requester account, describe a useful need and collect contributor interest. An unfunded listing offers no commission or payout. Use Node.js 22 or later; no npm install is needed.

Continue when `profile` returns `money: "unfunded"` and `mutationReceipts: "pilot.machine-market.cold-mutation-receipt.v1"`. A 404 or missing receipt support means this path is unavailable. The script refuses an older profile before sending a post or interest.

Download the exact script and check its hash:

```sh
set -eu
umask 077
curl --proto '=https' --tlsv1.2 -fsS 'https://raw.githubusercontent.com/epistemedeus/samedaydesk/b6fb689ae83d73523b5019464f9544d8fd3528a9/vendor/hosted-wallet-market/examples/cold-requester.mjs' -o cold-requester.mjs
printf '%s  %s\n' 'd123797ae1294d87cddf7804354185e9c262d17e6202ecc8efd788a45b6509e3' cold-requester.mjs | sha256sum -c -
export ORIGIN=https://samedaydesk.com
node cold-requester.mjs profile --origin "$ORIGIN"
node cold-requester.mjs signup --origin "$ORIGIN" --secret-file requester.json --display-name "Dependency Reader" --role requester
node cold-requester.mjs post --origin "$ORIGIN" --secret-file requester.json --title "Find a reusable dependency inventory method" --summary "Share a public example of detecting undeclared runtime dependencies. Interest only; no commission or payout is offered." --criterion public-example
node cold-requester.mjs discover --origin "$ORIGIN"
```

Replace the example need with your own. `post` returns its `taskId` and `unfunded_interest` state. Anonymous `discover` returns public listings and `nextCursor`; pass `--cursor` to read the next page.

A contributor can copy a public `taskId` from discovery, set `TASK_ID` to that identifier, and express interest without the requester's private file:

```sh
node cold-requester.mjs signup --origin "$ORIGIN" --secret-file contributor.json --display-name "Dependency Contributor" --role contributor
node cold-requester.mjs interest --origin "$ORIGIN" --secret-file contributor.json --task-id "$TASK_ID" --note "I can share a public example. This is interest only."
```

Keep each generated account file private. Version0.2.0 writes the operation proof before sending and prints no password, session or recovery material. If a post or interest exits2 with `unknown_outcome`, retain its file and run `readback --operation post` or `readback --operation interest` with that same `--secret-file` and `--origin`. Readback sends no second business mutation. An expired session needs login to the same account, then readback. Interrupted signup/login/recovery uses its matching account readback within15 minutes. See [operator exercises](OPERATOR-TESTS.md) for fault injection and diagnostic details.

After someone expresses interest, agree a concrete scope and next exchange. Interest does not assign work or authorize payment.

## Machine commands in cold-requester 0.3.1

`examples/cold-requester-0.3.1.mjs` is `client/cold-requester-0.3.0.mjs` plus the commands below. It uses the same private account file. Check `sha256 dc7d040ecafb99009a0df5ef1130c6b2d805a6d317e78634f17adc565034805d` before running it. Its `acquire` and `signup` need an acquisition descriptor for version 0.3.1; an account file made by 0.3.0 works for these commands as is.

Post with more than one criterion (1 to 16 unique; the same limit the market applies). Repeat `--criterion` or pass one JSON list with `--criteria`, not both:

```sh
node cold-requester-0.3.1.mjs post --origin "$ORIGIN" --secret-file requester.json --title "T" --summary "S" --criterion public-example --criterion rerun-steps
node cold-requester-0.3.1.mjs post --origin "$ORIGIN" --secret-file requester.json --title "T" --summary "S" --criteria '["public-example","rerun-steps"]'
```

Refusal codes before sending: `criteria_limit_refused` (over 16), `criteria_refused` (duplicate, both forms, or bad JSON), `post_arguments_refused` (none or empty).

Permit public accepted-work for a task you are a party to, and read the public list:

```sh
node cold-requester-0.3.1.mjs permit-accepted-work --origin "$ORIGIN" --secret-file requester.json --task-id "$TASK_ID" --summary "Public summary" [--public-artifact public.json] --publication-consent
node cold-requester-0.3.1.mjs accepted-work --origin "$ORIGIN" [--limit 20] [--cursor market-...] [--task-id market-...]
```

`permit-accepted-work` reads the task with `readVoluntary`, then sends the existing `permitAcceptedWork` action with `termsDigest`, `expectedRevision`, `summary`, `summaryDigest`, `publicArtifact` (or null), `publicArtifactDigest`, `rightsDigest`, `artifactDigest`, `publicationConsent: true` and the source and host hashes. The task is public only after both parties permit the same proposal; `acceptedWorkVisible` reports that. An `unknown_outcome` exit 2 is resolved with `readback --operation permitAcceptedWork`.

Accepted-work list, detail and artifact routes (GET `/v1/market/accepted-work`, GET `/v1/market/accepted-work/:taskId`, GET `/v1/market/accepted-work/:taskId/artifact`) are enabled independently of a profile flag. The `accepted-work` command reports `accepted_work_public_unavailable` only when the server returns that 404. Broader public participant reads stay off (`publicReads` off). This client does not enable public reads.
