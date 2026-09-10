# Direct API baseline vs packaged job

Baseline (any competent agent):
```bash
curl -sS "https://api.github.com/repos/NousResearch/hermes-agent/issues/99533"
curl -sS "https://api.github.com/repos/NousResearch/hermes-agent/issues/99533/comments?per_page=50&page=1"
```

Packaged extras (concrete, not invented savings / WTP):
1. Bounded paginated evidence retention with per-source retrieval status.
2. Immutable sequenced prior + later delta/changed-state record.
3. Constraint retention: page bounds, partial/error classification, no silent blank success.

HTML issue pages are not claimed to provide complete comments.
