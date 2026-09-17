Owning repo: **epistemedeus/samedaydesk** (not merchant).

# X37 commerce-receipts provenance pins

A claimed contribution SHA binds only if local `git cat-file -t` names a git
object. Fixture JSON does not substitute for `cat-file`. A named SHA that is
not an object is unknown context, not invented (`claimed_hash_unbound_object`).

| Asset | Pin | License / note |
|---|---|---|
| SameDayDesk checkout | `775051602d91f42ca1aa920054cfd7a451982940` | commit in this repository; `git cat-file -t` → `commit` |
| SameDayDesk pin tree | `778581173c6f23994aed1bb6ce9dc25d7b5b326a` | tree of the checkout pin |
| SameDayDesk `README.md` blob at pin | `c94d15beff60efa6b8b083de68e37972c84e1c8d` | blob; binds an object that is not a commit |
| S122 application-baseline merchant `c0255ac` | **unresolved in this checkout** | Not a git object here (S134). Seeded `claimed_hash_unbound_object`. |
| Full wrong SHA `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef` | **unresolved** | 40-hex name that `cat-file -t` rejects. Second seeded unbound hash. |
| Runtime `git cat-file` | local git, no network | Authority for object type. |
| GitHub API | **not used** | Do not ping remotes, Verantis, x402 Pulse, or payment rails. |

This tree does not fetch remotes, open issues, mutate pull requests, or
record payment, checkout, registry, or SKU fields.
