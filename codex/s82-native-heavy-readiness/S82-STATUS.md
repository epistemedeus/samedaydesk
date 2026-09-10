# S82 Native Heavy Readiness Status

- Observed: `2026-09-10T02:45:32Z`
- S77 artifacts: **preserved, not rerun** (S81 owns source/copy review)
- Native binary: `/home/ubuntu/.grok/bin/grok` (`grok 1.0.25 (f7e67d6988e2)`)
- Native catalog default: `grok-4.6`; available: grok-4.6, grok-4.5
- Profile auth.json present: **False**
- Auth state: **device_login_waiting**

## Device authorization (root action)

1. Open: https://accounts.x.ai/oauth2/device?user_code=N8NS-PZAM
2. Confirm one-time code: `N8NS-PZAM`
3. Poller: tmux session `s82-grok-device-auth` (alive=True); log `/tmp/s82-status/device-auth.log`
4. Expiry: CLI did not print a numeric expiry; treat code as short-lived one-time. Poller stays in Waiting for authorization...

After authorize succeeds, a follow-up turn can run the small native catalog/402 task. No wallet/sign/pay.
