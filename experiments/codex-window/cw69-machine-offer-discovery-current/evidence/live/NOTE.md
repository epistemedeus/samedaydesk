Live GET observations are not identity.

`openapi.json` and MCP exact version `1.23.49` still match the frozen hosted
evidence. `/.well-known/x402` returned 200 with a different body hash than
`evidence/remote/x402.json`. Identity stays on the capture. Do not treat the
live x402 document as a silent registry refresh.
