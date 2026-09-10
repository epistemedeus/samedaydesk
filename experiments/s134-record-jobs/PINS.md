Owning repo: **epistemedeus/samedaydesk** (not merchant).

# S134 pins

| Asset | Pin | License / note |
|---|---|---|
| OpenAPI/YAML parser | `yaml@2.9.0` (npm) | ISC; offline parse only; no `$ref` network resolve |
| CSV parser | `csv-parse@7.0.2` (npm) | MIT |
| RSS/Atom XML parser | `fast-xml-parser@5.11.1` (npm) | MIT; `processEntities:false` |
| Merchant context (page-change / record recipes) | `epistemedeus/x402-url-extractor@1a23b648e3c5f90bc009accb85972e2db6e22051` | MIT; **context only** — S134 CLIs do not wrap merchant HTTP or paid extract |
| S122 application-baseline merchant `c0255ac` | **unresolved in this checkout** | Not present as a git object in samedaydesk or the pinned merchant tip; treated as unknown context, not invented |
| Native model | `grok-4-6` + `--reasoning-effort xhigh` | Subscription display: SuperGrok Heavy; not a separate model id |
| Subagent depth | docs: max depth **1** (no grandchildren) | Verified in `~/.grok/docs/user-guide/16-subagents.md` |
| Subagent max concurrent | catalog `subagents_max_concurrent: null` | Ceiling **unknown**; do not claim 64 without measured reject |

npm audit on pinned deps at install time: **0 vulnerabilities**.
