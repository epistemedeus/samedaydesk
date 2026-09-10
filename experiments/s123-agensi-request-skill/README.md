# experiments/s123-agensi-request-skill

Bounded Stage-1 exploration of Agensi **Skill Requests** as a buyer-request opportunity source (not a generic registry listing).

## Result

**Negative.** Zero open skill requests on public MCP + public `skill_requests` readback. See `S123_RESULT.md`.

## One-command test

From this directory:

```bash
node ./scripts/probe-requests.mjs
```

From SameDayDesk repo root:

```bash
node experiments/s123-agensi-request-skill/scripts/probe-requests.mjs
```

Exit `0` while open requests remain empty. Writes `evidence/probe-live/probe-receipt.json`.

## License

Probe script and docs: MIT (SameDayDesk experiment). Upstream Agensi pages remain their property; captures are evidence only.
