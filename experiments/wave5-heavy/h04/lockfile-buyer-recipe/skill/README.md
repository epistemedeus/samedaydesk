# Optional portable skill

`lockfile-pin-delta/SKILL.md` is an Agent Skills file for an **existing**
official Hermes loader. It is not a Hermes plugin, not a payer, and not a
global install.

Proof (disposable profile only):

```bash
export HERMES_HOME="$(mktemp -d "${TMPDIR:-/tmp}/h04-hermes.XXXXXX")"
export HERMES_AGENT_SRC=/tmp/s77-input/hermes-agent
export SKILL_SRC="$PWD/skill/lockfile-pin-delta"
python3 test/hermes-dropin.py
```

Never point `HERMES_HOME` at `~/.hermes`. The checker copies one skill
into the throwaway profile and uses official `agent.skill_utils`.
No model call and no payment.

Root may later add this skill to `plugins/samedaydesk-x402/skills/` and
`WELL_KNOWN_SKILL_NAMES`. That merchant catalog change is out of this
recipe's in-place checkout.
