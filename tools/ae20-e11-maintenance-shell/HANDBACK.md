# Handback

Writer path: `tools/ae20-e11-maintenance-shell/` on `codex/ae20-e11-maintenance-shell`. No owner tree was edited. No patch is proposed. A patch that copied `readCurrent` into this repo would be a second authority store.

Next integration owner: dr eggbot, then Root.

## samedaydesk `tools/ae14-compat-maintenance` @ `50210d0dbd2e24194c84b486bf31dc3c705ba06b`

Retained asset. This shell reads `samedaydesk.compat-maintenance-occurrence.v1` and checks the digest from `src/result.mjs`. The recipe, supplier 228200, and the 228300 finite queue stay where they are.

## neomorphic-io E21 `codex/ae14-e21-contribution-handback` @ `2db38faab2f79cd7b3dc3110c54d301834c9611b`

Authority stays `experiments/ae14-contribution-handback/INTERFACE.md` and `src/agent.mjs#agentInterface.reuse`. Current rights stay E02 `readCurrent` at `89033e06ed6f2a455051ad8612c36394ad87a7a4`. This shell evaluates a supplied `CurrentReuseResult`. It does not open Postgres, does not accept a session token as a grant, and does not widen `safe_derivative_only`.

The later consumer for this pending export is the E21 contribution handback reader.

## neomorphic-io J2 `codex/ae14-j2-work-network-composition` @ `016b38838d1fcc66128e000f39487d044dc497be`

E11 remains `pending-join:E11@50210d0dbd2e24194c84b486bf31dc3c705ba06b` (maintained applicability). The later consumer is the J2 maintained-applicability step. Join it by calling this shell's one-shot CLI with the live `readCurrent` answer for the same tenant and task. Admit only `safe_derivative_only` coverage of `accepted_artifact`.

## pilot amend4 @ `d478ae8621d2f1ac90002e5a248286d784cc283c`

Consumed as the defect record (`ae14-transport/g2/amend4/J2-AMEND4.md`, `ae14-transport/g2/amend4/E21-AMEND4.md`). The terminal G2 export those notes describe is the pending join named in `test/pending-joins.test.mjs`. This package does not re-fix those owner defects.
