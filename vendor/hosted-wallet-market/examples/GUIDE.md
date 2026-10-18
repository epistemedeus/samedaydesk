# Post an unfunded request

Open a requester account, describe a useful need and collect contributor interest. An unfunded listing offers no commission or payout. Use Node.js 22 or later; no npm install is needed.

Availability: this entry is a release candidate. Continue only when `profile` returns `money: "unfunded"`; a 404 means the service has not opened the entry yet.

Download the exact script and check its hash:

```sh
set -eu
umask 077
curl --proto '=https' --tlsv1.2 -fsS 'https://raw.githubusercontent.com/epistemedeus/samedaydesk/2952f46db6049b264084611ef133ecc2f9a68816/vendor/hosted-wallet-market/examples/cold-requester.mjs' -o cold-requester.mjs
printf '%s  %s\n' '0f980632daa109c0067542d60a7289f7a9fa890098be7002d2f167614c6b7ad1' cold-requester.mjs | sha256sum -c -
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

Keep each generated account file private. The script writes it with mode `0600` before sending, and never prints its password, session or recovery material. If it exits `2` with `unknown_outcome`, retain the file and use `readback --operation signup`, `login` or `recover` for that interrupted account operation. Stored readback is available for 15 minutes; it does not send the account mutation again. See [operator exercises](OPERATOR-TESTS.md) for the test and recovery matrix.

After someone expresses interest, agree a concrete scope and next exchange. Interest does not assign work or authorize payment.
