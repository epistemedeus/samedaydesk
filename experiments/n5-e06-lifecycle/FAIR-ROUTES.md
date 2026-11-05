# B1 fair routes: useful-jobs acquisition (no weakened direct path)

GRAND-PLAN B1 asks for three fair routes with the same legitimate inputs. This note records them for useful-jobs 1.4.7. Synthetic owner-run only. Not a customer, bill, live quote, or purchase authority.

Parent evidence: N5-E06 RESULT (PR361 `a3551015`) and [USER-ROUTE.md](./USER-ROUTE.md) (PR363).

## Shared pins

| Field | Value |
| --- | --- |
| Archive URL | https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz |
| bytes | 5255824 |
| sha256 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| npm integrity | `sha512-eDKT6Be1gin85rE1BmzNMVG3UGw/IwxNK1X8lzCAvo+HQLKO0vmGAc6YFRjTx73+I0rede5XaCQ+aDw+HYZzKQ==` |
| Git blob (E06 head) | `d8aecf276ce2eb23f4d30f5575085bc992134841` |
| Job | `vendor-budget-impact` on kit samples under `samples/pricing/caller-alpha/` |
| Expected B digest | `0ea6c814c944ec14` |

## Route D — competent direct (baseline)

Cold empty directory. Ordinary npm of the hosted URL. No Pilot helper, no acquire substitution, no USER-ROUTE required.

```bash
mkdir -p /tmp/uj-direct && cd /tmp/uj-direct && npm init -y
npm install "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"
node node_modules/useful-jobs/bin/useful-jobs.mjs run vendor-budget-impact \
  --before node_modules/useful-jobs/samples/pricing/caller-alpha/before.json \
  --after node_modules/useful-jobs/samples/pricing/caller-alpha/after.json
```

Pass: exit 0, digest `0ea6c814c944ec14`. This route must stay as easy as any maintained path.

## Route P — public artifact bytes

Same cold directory pattern, but verify the archive before install (public materials only):

```bash
curl -fsSL -o useful-jobs-1.4.7.tar.gz \
  "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"
echo "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec  useful-jobs-1.4.7.tar.gz" | sha256sum -c
npm install ./useful-jobs-1.4.7.tar.gz
# then the same run command as Route D
```

Pass: sha256 check ok, same digest as Route D. Integrity mismatch must refuse without a custom installer.

## Route M — maintained / adapted recipe

Follow [USER-ROUTE.md](./USER-ROUTE.md) (this experiment's compounding asset). Same npm install and job; the adaptation is documentation and refuse guidance, not a new binary.

Pass: same digest as Route D. If M is harder than D, M loses; do not weaken D to make M look better.

## Copy-in / identity packaging (related COMPAT)

N5-IDENTITY (neomorphic-io PR446 `aa7f180a`, merged) owns query-identity copy-in vectors. It is a packaging alternative for identity cases, not a substitute for Routes D/P/M above. Portable acquisition keeps both: npm pin for useful-jobs, copy-in cases for identity strings.

## Named later consumer

Same as USER-ROUTE: a fresh cold agent on Route D or P, running `vendor-budget-impact`. Record which route was used. Not the E06 writer checkout.

## Suite (on enrolled model-free Cursor VM)

1. Run D, P, M independently; compare digests.
2. Refuse: truncated archive, wrong sha256, unknown 1.4.6 URL.
3. Do not run large fleets on the Bot host.
