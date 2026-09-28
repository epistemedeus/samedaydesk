# CW65 current-core acceptance foundation

**Unfinished; not ready.** Continue from [GROK-HANDOFF.md](GROK-HANDOFF.md).

This directory combines new consumer cases under `experiments/wave5/d16/`, `d18/`, `d19/`, and `d20/`. Original imports and historical receipts are unchanged; `IMPORTS.json` records exact source blobs. New tests use in-tree current-core modules and fresh caller inputs.

Only syntax checks, 9 independent controls, and one failing vendor acceptance probe have run. The verified failure is a harness assumption about an optional nested receipt field. Other cases are partial source, not coverage claims. No shared runtime files changed.

The handoff provides portable commands, dependency drift, known scaffold defects, raw evidence paths, and exclusive remaining work for native Grok Heavy.
