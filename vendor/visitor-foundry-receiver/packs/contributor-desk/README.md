# Contributor desk (W0-R3-05)

Walletless public desk for earned-work: **browse**, **claim**, **status**, **appeal**, **owed-versus-paid**.

This is a pack of adapters plus a laboratory page. It is not the F01 HTTP kernel, not a wallet, and not the R3-09 settlement receipt view.

## Honesty

- No wallet, seed, or chain signature is required to browse, claim, or read status.
- The desk process must not hold an `EARNED_WORK` secret (`EARNED_WORK_OWNER_TOKEN` and siblings). That is a seeded refusal.
- A contributor session must not hold a payout key. That is a kill.
- `payoutState=owed` is an IOU. `paid` stays false. `settled` stays false. `transfer` stays null.
- Integer F01 `termsVersion` is rejected. I01 start-work keys are `sha256:` + 64 hex.
- Local fixture success is not hosted settlement and not `actual_completion`.

## Commands

```sh
node bin/desk.mjs browse
node bin/desk.mjs claim --task tsk_open_alpha --contributor-id ctr_walrus
node bin/desk.mjs status --task tsk_open_alpha
node bin/desk.mjs appeal --task tsk_rejected_gamma --contributor-id ctr_gamma --reason "Bound digest was labelled against the wrong fixture note."
node bin/desk.mjs owed-versus-paid --task tsk_owed_delta
node bin/desk.mjs journey
node --test --test-concurrency=1 tests/*.test.mjs
```

Seeded failure (must exit 3):

```sh
EARNED_WORK_OWNER_TOKEN=dev-owner-token-s275 node bin/desk.mjs browse
```

Kill (must exit 4):

```sh
node bin/desk.mjs browse --payout-key aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

HTTP adapter (caller-supplied `http`/`https` origin, contributor token the caller already holds — the desk will not mint one with an owner token). Redirects, embedded credentials, and non-http protocols are refused:

```sh
node bin/desk.mjs browse --adapter http --origin http://127.0.0.1:8791
```

## Page

Laboratory fixture desk: `/labs/contributor-desk/` (noindex until the public route docket is amended). Machine contract: `/labs/contributor-desk.json`. The page is not linked from `src/pages/labs.astro` or `public/llms.txt` in this branch.

## One caller

```sh
node bin/lifecycle.mjs --input fixtures/lifecycle-caller.json --out /tmp/contributor-lifecycle
```

That command inspects fixture terms, writes a local fixture grant, submits one fixture result, and reads a separate dispute fixture. The receipt keeps `paymentAuthority: false`. It does not contact PR109.

## Pins cited, not copied

| Contract | Pin |
| --- | --- |
| I01 hash terms | `346bbd3cbe6943a83b2077c455174d74b7a493ad` |
| F01 kernel (absent on main) | `fable/f01-s275-kernel` / PR 39 |
| F04 late address | PR 45 |
| R3-09 settlement receipt | disjoint — this pack does not render it |
