# Agent Growth Loops contribution and delegation prototype

Local no-spend prototype for two hypotheses on the installed SameDayDesk voluntary participation contracts. Base commit `0593026ad155352f263e4749dc889a1578d91675`. The prototype lives in this directory. It imports the installed host, cold client, fee module, and publication checker. It does not edit `vendor/hosted-wallet-market`, the live pin, the clients, or existing tests.

The host is `server/scripts/root10940-machine-host.mjs`: loopback TLS, a disposable local PostgreSQL cluster, and the unfunded `voluntary-artifact-v1` profile. `acceptedWorkPublic` stays false. Public reads stay off. Accounts are created only inside that disposable host and are labeled `SYNTHETIC`.

## H-A: permissioned cross-implementation contribution and handback

What it tests. Synthetic contributor B delivers an accepted roster-rename artifact for implementation X. Synthetic requester A grants that artifact to a different requester, synthetic requester C, under the existing CC0 rights. C exports it, applies the rename to its own changed roster row (`SYN-Y-441`, which is not the artifact sample and not an installed fixture), posts implementation Y, and records that handback with `useVoluntary`. A lost response is recovered with `readbackVoluntary`. The recovery leaves the original `useVoluntary` URL untouched, which the harness checks by arming the host drop on that URL and seeing the drop remain armed. Withdrawal deletes the grant and later export and later use recording both stop.

What it cannot establish. One synthetic later consumer on a disposable host is not outside use, a network effect, or retained demand. The handback is an authenticated self-report (`independence: unknown`). Withdrawal does not erase bytes C already received. This run does not publish the artifact.

Live metric. Distinct later consumer use per accepted artifact. A live reading would count distinct later consumers whose `downstream_use` records bind an accepted artifact. This run observes one such record for one synthetic consumer.

## H-B: agent-to-agent delegation on the unfunded profile

What it tests. Synthetic requester A posts a dock-handoff need that is not an installed fixture. Synthetic contributor B expresses interest. A reads that interest, offers with explicit rights, B assents and delivers a second artifact, and A accepts it. The platform fee is computed with `vendor/hosted-wallet-market/src/fee.mjs` (`quoteEconomics` / `feePerCapture`) and is not quoted, captured, or stored. The profile stays unfunded. `fund` is refused. Wallet submission calls stay at 0, `signerAuthority` stays false, and the financial snapshot is unchanged.

What it cannot establish. The pair is two synthetic accounts on a Pilot disposable host, so it is not a non-Pilot requester/provider pair. A computed fee is not a fee event and is not revenue. Acceptance on the unfunded profile creates no obligation, escrow, or settlement.

Live metric. Non-Pilot requester/provider pairs and fee events. A live reading would count pairs whose accounts are outside Pilot and fee events the existing quote and capture path actually records. This run observes one synthetic pair and zero persisted fee events.

## Refusals

- Wrong authority: a stranger review, a stranger export, a contributor grant, a contributor interest read, and a stranger `useVoluntary`.
- Missing consent: `authorizedToRequest: false`, `authorizedToShare: false`, acceptance without export authorization, export before `grantVoluntary`, and `publicationConsent: false` on the publication checker.
- Withdrawn grant: `withdrawVoluntary` then stops export and a later use record.
- Private data in a public field: the installed publication checker returns `private_field_refused` for the private title, the private summary, and a `requesterId` key. The check runs on a clone. The task row is unchanged and `permitAcceptedWork` stays `404`.

## Run

```sh
node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs
node --test --test-concurrency=1 server/scripts/test-h133010-accepted-work.mjs
```

The second command is the existing accepted-work test, unchanged. Both use the disposable local PostgreSQL from the host harness. No hosted database, production endpoint, deploy, signer, or spend is involved.

## Open questions for Root

1. Activation of a public accepted-work route is a separate reviewed process. This prototype leaves `acceptedWorkPublic` unset and `publicReads` at 0. Which outside consent and which useful sample would have to exist before that flag is passed on a regenerated profile?
2. The H-A live metric needs a later consumer who is not the accepting party. Which account provenance would count as outside Pilot?
3. A live H-B fee event requires the existing qualified quote and capture path, which can move money. Which funded receiving would have to finish before any such event is admitted?
4. Withdrawal stops later retrieval and later use recording. It does not claw back CC0 bytes already exported. Is that the retention rule activation should keep?
5. The disposable host signer stays false and no settlement row changes. Which additional check should precede any later signer or settlement admission?
