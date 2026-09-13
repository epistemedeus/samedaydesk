# Current consumer feature map

| Surface | Current implementation |
| --- | --- |
| Python entry | `samedaydesk_useful_jobs`, console `samedaydesk-useful-jobs` 1.1.0 |
| Runtime dependency | Pinned useful-jobs 1.4.1 archive, ten jobs; no engine vendoring |
| Acquisition | Packaged digest, size, catalog/output contract; bounded extraction; explicit archive works outside checkout |
| Invocation | Literal argv; caller-relative input paths; private Linux subreaper; bounded streams |
| Delivery | New output destination, private stage, strict report and artifact checks, atomic no-replace publication |
| Claims | SAMPLE or caller input; delivery separate from domain status; no payment authority |
| Tests | Serial Node suite, nested Python review suite, fresh venv cold console invocation |
| Canonical-entry recommendation | Consolidate future Python integrations into this existing package; keep CW39 read-only until separately assigned |

Current evidence and limitations:
`experiments/codex-window/cw64-installed-client-current-runtime/GROK-HANDOFF.md`.
Original D08 and CW39 receipts are preserved in that directory's `evidence/`.
