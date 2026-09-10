# S142 — consumer verification of S134 record-job CLIs

Independent consumer fixtures + gates against the four **exported** S134 CLIs.

- Owning repo: **epistemedeus/samedaydesk** (not merchant)
- Source build: `../s134-record-jobs` (kept on this VM)
- Cash: $0

```bash
# from experiments/s134-record-jobs
npm ci && npm test && npm run demo:all

# from experiments/s142-record-jobs-final
npm run verify
```

See `RESULT.md` and `PINS.md`.
