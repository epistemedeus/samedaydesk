# First-customer experiment: recurring useful jobs

Label: `internal` / owner QA. Not organic demand or banked revenue.

## Hypothesis

An operator who already holds page or extract JSON will pay attention to a
bounded recurring recipe that answers one question: did the watched source
change in the fields I named, since the immutable prior I keep?

## Offer (one sentence)

Run a one-shot `source-change-alert` or `comparable-record-extraction` against
your prior and schedule; receive unchanged / changed / partial / stale / error
evidence without a daemon and without automatic payment replay.

## Setup

1. Pick one public page the operator already cares about, or use the fixture pack.
2. Capture sequence-1 prior JSON (title or selected fields). Keep it immutable.
3. Operator supplies schedule hint (`daily` or `weekly`) and a clock/horizon.
4. Run the matching recipe offline first. Optional `--live-safe` against
   `https://example.com/` only when a free live check is useful.
5. On `changed`, review evidence and write sequence-2. Do not overwrite sequence-1.
6. On `partial` or `error`, keep rows visible; retry only failed sources later.
7. Never pass `--replay-payment`. If a prior receipt exists, reconcile separately.

## Success signals

- Operator re-runs the same recipe after the stated schedule with the same prior.
- A changed outcome produces a new sequenced artifact the operator keeps.
- No paid merchant call is required for the offline path.

## Kill / revise

- If the only activity is our own agents chatting about the recipe, revise the
  watched source and benefit before packaging, hosting, or pricing a monitor.
- Do not invent customers, settle fake demand, or open an always-on watcher.

## Cost honesty

Offline runs use operator compute. Free live HTML is not zero marginal cost.
Paid freshness remains the sourced 0.01 USDC batch route on `/for-agents` and
is outside this pack unless the operator explicitly purchases elsewhere.
