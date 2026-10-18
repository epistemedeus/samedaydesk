# Operator regression exercises

These are the fixture commands consumed by `server/scripts/test-root404-cold-requester.mjs`. Run the test against disposable PostgreSQL and verified TLS. The independent receiver is `server/scripts/test-root410-requester-receiving.mjs`; it drops responses after commit and checks stored readback without repeating the account mutation.

`ORIGIN` and `CA` below belong to the disposable HTTPS fixture. Copy the script into an empty private directory. No live signup or post follows from this test recipe.

```sh
node cold-requester.mjs profile --origin "$ORIGIN" --ca-file "$CA"
node cold-requester.mjs wrong-wire --origin "$ORIGIN" --ca-file "$CA"
node cold-requester.mjs signup --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --display-name "Cold Requester" --role requester
node cold-requester.mjs replay-signup --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs readback --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --operation signup
node cold-requester.mjs login --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs recover --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs login --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs post --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --title "Cold unfunded need" --summary "Interest only. No commission and no payout is offered." --criterion observable
node cold-requester.mjs replay-post --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs conflict-post --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs post-without-csrf --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs discover --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs signup --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --display-name "Cold Contributor" --role contributor
node cold-requester.mjs post --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --title "Contributor cannot post" --summary "A contributor session cannot create the requester listing." --criterion observable
node cold-requester.mjs interest --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --peer-secret requester.json --note "Interest only. This is not commissioned work."
node cold-requester.mjs fund --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs signup --origin "$ORIGIN" --ca-file "$CA" --secret-file abandoned.json --display-name "Abandoned Signup" --role requester
```

The wrong-wire, conflict, missing-CSRF, contributor-post and fund commands must fail. Retain QA account, task and operation IDs in a private exclusion packet. Funnel exclusions filter reads, never delete the underlying business records.

For an interrupted account operation, retain its file and run `readback --operation signup`, `login` or `recover`, matching the interrupted operation. Do not repeat signup under another key. Readback expires after 15 minutes, and a later session delivery can supersede its cookie. A confirmed refusal remains a refusal. Never infer a successful mutation from a timeout.

Capability-off rollback is tested by restarting this same candidate with the profile unset. That test does not restore the predecessor binary. The source and deployment rollback procedure is in `../COLD-REQUESTER.md`.
