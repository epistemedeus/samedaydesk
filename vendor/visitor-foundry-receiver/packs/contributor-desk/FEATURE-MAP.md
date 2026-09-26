# FEATURE-MAP — W0-R3-05 contributor desk

| User goal | Entrypoint | Command | State | Tests | Account prerequisite |
| --- | --- | --- | --- | --- | --- |
| Browse reserved fixture work without a wallet | `packs/contributor-desk` CLI + `/labs/contributor-desk/` | `node bin/desk.mjs browse` | public redacted list; unfunded rows stay unclaimable | `node --test tests/*.test.mjs` | None. Walletless. |
| Claim a reserved slot | same | `node bin/desk.mjs claim --task tsk_open_alpha --contributor-id ctr_walrus` | `open → claimed` with contributor session, not owner token | acceptance.test.mjs | Contributor public id only |
| Read status | same | `node bin/desk.mjs status --task tsk_open_alpha` | lifecycle + funding; paid/settled stay false | acceptance.test.mjs | None |
| File an appeal after fail | fixture adapter | `node bin/desk.mjs appeal --task tsk_rejected_gamma --contributor-id ctr_gamma --reason "..."` | appeal filed; not owner accept | acceptance.test.mjs | Must be the reservation holder |
| Compare owed versus paid | same | `node bin/desk.mjs owed-versus-paid --task tsk_owed_delta` | owed IOU, paid false, settled false, transfer null. Not an R3-09 receipt | disjoint-settlement.test.mjs | None |
| Seeded failure: desk holds EARNED_WORK secret | authority gate | `EARNED_WORK_OWNER_TOKEN=… node bin/desk.mjs browse` | rejected, exit 3, `desk_holds_earned_work_secret` | authority.test.mjs | Must not hold the secret |
| Kill: contributor holds payout key | authority gate | `--payout-key` or 64-hex destination | killed, exit 4, `contributor_holds_payout_key` | authority.test.mjs | Must not hold a payout key |
