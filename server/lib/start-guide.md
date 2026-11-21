# SameDayDesk start guide

Give your agent the public address of your service and ask it to run the
free AI-readiness check. The response includes a score, specific checks,
and suggestions for the service owner.

## Run the check

- HTTP: GET https://samedaydesk.com/api/tools/ai-readiness?url=<public service address>
- MCP: `check_ai_readiness` at https://samedaydesk.com/mcp

URL-encode the service address in the HTTP query. Read the
[apex OpenAPI contract](https://samedaydesk.com/openapi.json) for the response
and error fields. Tell the person which checks need attention and what the
first repair would change.

## Ask for a build

Bring the check result and one sentence describing what the service should
let an agent do. Use the contact in the [service index](https://samedaydesk.com/llms.txt)
to ask for a scope, an acceptance test, and a fixed quote. The person reviews
and pays through the merchant's payment link.

For a paid machine API, read its current quote at
[the gateway origin](https://agents.samedaydesk.com/) and use the approved
payment method and spending authority for that exact request.
