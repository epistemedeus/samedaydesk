# Nov 04 qualified reuse release proposal

This is the managed release proposal for branch `codex/nov04-qualified-reuse-integration`. It is not a deployment, not a Hostinger call, not a merge, and not an installed proof.

Native `gpt-6.1-sol` was not available on this VM. `codex`, `openai`, and `chatgpt` are absent from PATH, and no enrolled native runner was present. This proposal was prepared on the included Cursor-Grok 4.7 turn.

## Source

Base `codex/h136010-machine-release-20261103` is `0593026ad155352f263e4749dc889a1578d91675`.

Accepted inputs composed here:

- CONTRIB `633a1ced99bb72e798c4b2195261ec1646d21f82`
- EMBED `1003b9ec6c3d46826f54a398fce4bb6d0821596f`
- Pulse `30924c4d5497122366181a9705328af8b002ad3d` on `codex/sds-pulse-token-fail-closed-20261104`. The seven-file scope is the complete pulse delta from the base. The pulse branch was not merged as an unrelated history.
- RECUR `da769f7870e494bb583e31766a477a2ff974fc10`, tree `e34d2a883546e5c8b1b167d831ca0c7d6526b9b6`. Its three commits sit on the same base. The diff is `package.json` plus `tools/result-reuse`. It composes without unrelated ancestors and without public marketing. It is a laboratory block. It is not a public-kit `source-change-alert` job and it does not establish a net saved cost.

The result-reuse import closure also reads the existing, unchanged modules `tools/recurring-job-recipes/lib/cost.mjs` and `tools/recurring-job-recipes/lib/recovery.mjs`.

## Host profile

`installedSourceSha256` is `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`.

`hostSourceSha256` is `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`.

That host pin is the private-control file set, 1323 members. The only member whose hash changed in this compose is `package.json`, now `e2af16586935e92dde2dbb39e6d192e9cc5e845b692e426962891be203a4b0a4`, because `test:result-reuse` gained the decide-or-reuse tests. The prior integration pin was `937a4c811ff72300f27cd1d7ca144894d07a2a3ef00e58553c5be9f2d2a6c53d`. The earlier pin was `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`.

`6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd` is unreceived, unqualified, and unenrolled. `qualified` and `installed` stay false. Money stays `unfunded`. Participation stays `voluntary-artifact-v1`. Enrollment belongs to Root.

The unreceived candidate is `docs/receiving/h145010-useful-tool-measurement-20261104/proposed-anchor.json` and `proposed-descriptor.json`. `ENROLLMENT.json` has `received` false. The approved catalog was not edited.

## Loaded pulse identity

`server/index.js` loads `server/app.js`. `server/app.js` loads `server/lib/pulse.js` and `server/routes/pulse.js`. `server/lib/pulse.js` is in the host pin and is unchanged from the base, sha256 `fbaaa3cba57de74ecf78dcc6aa5b0c18bf90bd33ed0cada1f55b214cd3751b49`.

`server/routes/pulse.js` is the fail-closed read. It is not a host-pin member. Its sha256 is `15ee44563aa5d1ea6a2591788a2d9ca5bd9997d69e6c97de56462add6e060aff`. An unchanged host hash, including `8f8ce3b3` and `937a4c81`, is not proof of these route bytes. The new host hash `6fca4aaa` also does not cover them. It moved only because `package.json` is a pin member.

The private reader `server/scripts/pulse-private-read.js` is new and outside the pin, sha256 `344e8b34a78dbf6bff0c0fb80c9eb60718de23f52cd2c62304c17ec1ba65f215`.

`docs/receiving/nov04-qualified-reuse-integration/LOADED-PULSE.json` lists the static import closure, which files are in the host pin, and which bytes changed from the base. It is a candidate identity, not an installed proof.

## Acquisition packet mismatch

GitHub Actions run `41909890197` on head `8a33717f` failed only at "Receive the independent acquisition packet", exit 3:

`stale actual 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82 expected 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`

The selector prints source hashes. Exit 3 means the compared packet's source or host differs. On that head the measured source was `2fc7a988` and the proposed host was `937a4c811ff72300f27cd1d7ca144894d07a2a3ef00e58553c5be9f2d2a6c53d`. The first catalog packet with the same source is host `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`. The H142 slot is host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255`. The `ROOT10940_CI_PACKET` value on that run is the cafd profile, source `5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2`, host `1d75941ad2799af00f29f18b42031a4104ea247ef36c4172d1342dbacf0d289c`. None of those hosts is the proposed profile. The source hash agrees.

After this compose the same selector still exits 3. The measured host is now `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`. The catalog still has no slot for it.

This refusal is the owner-only qualification gate. It is not a runtime startup defect and it is not a reason to rerun the same check. The strict selector stays unchanged. No trust anchor was forged and no secret was written.

## Human assets and environment

`node server/scripts/publish-preserved-client.mjs` exited 0: `viteInvoked` false, 352 files, 59951737 bytes, inventory `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5`. `client/dist` is byte-identical to the base. No human-facing copy or layout was edited.

The recorded 89-row environment remains `2afe45a622df4123442afc02b9e747db8bccda4cb505fe18889893ca63b59493`. This worker did not read Root credentials, did not change Hostinger, and did not touch the live store.

## Root install and readback

Keep the 89-row environment. Put the separately stored replacement `PULSE_TOKEN` into that environment. It must be at least 16 characters. Do not print it. Do not unset it on rollback to older source: the old route uses `process.env.PULSE_TOKEN || "p7f3a9c2e"`, so clearing the token re-enables the historical fallback.

After an independent replay, and only on a copy, add `receiving` to the proposed anchor and enroll the slot:

`2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82-6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd.json`

Leave the cafd slot and the H142 slot in place. Set `ROOT10940_CI_PACKET` only to that new packet. Until then the workflow receive step exits 3.

After install, confirm the served `server/routes/pulse.js` sha256 is `15ee44563aa5d1ea6a2591788a2d9ca5bd9997d69e6c97de56462add6e060aff`. With the token unset, `GET /api/pulse` returns 503 `{"error":"Pulse read unconfigured"}` and `Cache-Control: no-store`. A wrong `k` returns 404. The matching token returns 200 and must not appear in the body. `POST /api/pulse/event` stays public. An unknown event returns 400. The private reader is:

```text
node server/scripts/pulse-private-read.js --origin https://samedaydesk.com --env-var PULSE_TOKEN
```

Do not merge, deploy, sign, pay, fund, or publish human assets from this proposal.
