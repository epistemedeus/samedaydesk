# @agentcash/discovery 1.7.5 (fundless)

Same maintained line as SDS lqdist1 (`COMMANDS.md`). npm latest at probe was 1.8.0; this package pins the audited 1.7.5 CLI/API.

## Install / commands

```bash
npx --yes @agentcash/discovery@1.7.5 discover https://agents.samedaydesk.com --json
npx --yes @agentcash/discovery@1.7.5 check https://agents.samedaydesk.com/lockfile-pin-delta --json
```

CLI `check` has no `--body`. OpenAPI still lists POST `/lockfile-pin-delta` as paid 0.005 USDC x402-only.

JS API with a valid lockfile body (unpaid):

```js
import { check } from "@agentcash/discovery";
await check("https://agents.samedaydesk.com/lockfile-pin-delta", {
  sampleInputBody: { before, after },
});
```

Empty `{}` is HTTP 400 (`before` required); AgentCash then reports OPTIONS `unprotected`. That is not a free route.

## Unsupported

Sign, pay, PAYMENT-SIGNATURE, wallet, facilitator settle, MPP on this route.
