# Activation

This packet is not an activation. Nothing here was installed on the live host, and accepted work stays off.

## Configuration

- No new environment key. The profile omits `acceptedWorkPublic` unless `vendor/hosted-wallet-market/bin/machine-profile.mjs` is passed `--accepted-work-public true` on an unfunded `voluntary-artifact-v1` profile. Other values are refused. An unfunded profile may still carry `networkSource`.
- `openHostedMarket` turns the route on only when that admitted document says true or the existing caller boolean is true. Money must be unfunded, participation must be voluntary, and public reads, payments, funded tasks, and human assets stay closed.
- The mount still forwards only an explicit caller boolean. Production `server/app.js` does not set it. The installed profile does not advertise accepted work.
- Recorded `vendor/hosted-wallet-market/SOURCE.json` `installedSourceSha256` stays `458c129b2397099200be163ea6b11be61926114f9d6842897607cfcb9a771ba8`. `recordedSourceConstantAgrees` is false.
- The release candidate is `e32c3f2ce4391ccba9e7d15a3fda0a65459406fd`. Measured source is `9c57f71bb55d1d7b33e7ecc824393a1b55909b2da7f80ad5bd9d6ae8d872ba3d`. Measured host is `f16b1673219be5e77da9aed677305bf1dbc32c32d13991cc46e95e76f28cf8e0`.
- The baseline is installed `b28b3c0024b885b7ea7ae672a978e11251ef71ca`, source `8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6`, host `a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3`, Hostinger build `01a19efd-4d8b-71d4-afa1-4fd7aa2f9789`.
- Disposable install, verify, and rollback used `server/scripts/h120010-promote.mjs` and returned to that baseline identity. Human inventory stayed `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5` (352 files, 59951737 bytes, Vite not invoked).
- `successor-descriptor.json` is private and unpublished. `hostedAcquisitionVerified` is false. The public b28 descriptor was not replaced.

## Not done

No production schema or config write, no public-read enablement, no live task, account, consent, offer, signer, payment, funding, merge, or deploy.
