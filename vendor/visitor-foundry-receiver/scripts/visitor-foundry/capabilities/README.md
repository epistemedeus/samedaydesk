# Versioned capability projection

Additive VF01 foundation over the existing S04 catalog and preflight package.
This directory is a local Node 22 module and CLI, not a second hosted registry.
No install is needed. From the repository root:

```sh
node scripts/visitor-foundry/capabilities/src/cli.mjs demo
node scripts/visitor-foundry/capabilities/src/cli.mjs holdouts
node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs
```

Import `src/index.mjs`. Build immutable versions with `createVersion`, assemble
an authenticated inventory using `createSnapshot`, and call `resolve` or
`resolvePage` with an explicit UTC clock and host-owned evidence admission policy.
Default admission trusts no observations. The JSON CLI policy file is explicit
local operator input; a hosted implementation must never accept this policy from
a contribution or public request.

The four statuses are `compatible`, `known-incompatible`, `missing`, `unknown`.
Compatibility is typed usability within a pinned inventory, not registry
acceptance, actionability, invocation, useful delivery, independence or payment.
Only a complete declared inventory scope can yield `missing` or a genuine gap.
Contradictory, absent, out-of-scope and expired evidence leave compatibility
unknown unless a separate definite constraint rules the version out.

See [CONTRACTS.md](CONTRACTS.md), [RESULT.md](RESULT.md), and
[HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md) for exact contracts, actual
validation and staged hosted integration. The held-out examples are synthetic,
owner-controlled and reproducible; they establish no external savings or demand.
