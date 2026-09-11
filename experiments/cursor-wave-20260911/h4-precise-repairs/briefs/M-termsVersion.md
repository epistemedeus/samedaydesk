# M-termsVersion — F01 integer `termsVersion` vs F17/F02 content hash

**Disposition:** `briefed_out_of_scope`  
**In SDS scope?** No (Neo).  
**This pack:** repair brief only. **not patched on SDS.**

## Problem

MONITOR-STATUS (wave monitor closeout ~18:55Z) quotes the residual as:

> F01 integer `termsVersion` vs F17/F02 content hash

F01 identifies terms by an integer `termsVersion`. F17/F02 identify terms by a content hash of the terms bytes. Those are different identity types. An integer does not name the same object as a digest of the current terms document. Treating them as interchangeable (or silently coercing integer↔hash) makes two parties think they agreed to the same terms when they only agreed to a version number, or to a hash of a different preimage.

This workspace has **no** `termsVersion` field in SDS source. A repo-wide search on `fable/h4r-defect-corpus` and `origin/main` hits only this pack’s MONITOR table. Neo (`neomorphic-io`) is **not** in this workspace: there is no Neo clone, no `packs/` tree, and `gh repo view epistemedeus/neomorphic-io` does not resolve. SDS vendored `@neomorphic/correspondence` is a shared-host correspondence package, not the Neo terms surface.

## Why out of scope for SDS / this pack

PROMPT-H4R maps `M-termsVersion` to **No (Neo)** and **Repair brief only under pack `briefs/`**. Hard out of scope: “Do not claim Neo (neomorphic-io) patches on SDS.” This pack cannot write Neo. No F01/F17 named branch exists on `origin` (`git ls-remote --heads origin` lists SDS `fable/w2-06-e01-cold-start-assessment`, `fable/w2-09-f07-consumer-evidence-refresh`, `fable/f08-paid-wrappers`, and the H4/H4R branches — not F01/F17).

Repairing integer-vs-hash terms identity on SDS would be a false claim that the defect lived here.

## Recommended Neo-side repair

Do this on Neo, not SDS:

1. Use **hash-based terms identity** (F17/F02 content hash). Identity is the digest of the exact terms bytes (SHA-256 of the canonical preimage), not an integer counter.
2. Keep integer `termsVersion` (if F01 still emits it) as a **non-identity label** only — display/debug — never as the equality key.
3. **Do not silently coerce integer↔hash.** `1` is not a hash. A 64-hex digest is not an integer version. Mismatched types are an error, not a cast.
4. Same bytes ⇒ same hash identity, even if the integer field is unchanged or omitted. Different bytes ⇒ different identity, even if the integer field is unchanged.

No SDS patch is specified. This brief does not invent Neo source edits.

## Acceptance tests Neo would need

- Integer `termsVersion` (example: `1`) is not equal to the SHA-256 of the terms bytes.
- Passing an integer where a content hash is required is rejected (no `String(n)` / `Number(hash)` coercion).
- Passing a content hash where an integer `termsVersion` is required is rejected.
- Two documents with the same integer `termsVersion` and different bytes have **different** hash identities.
- Two copies of the same bytes have the **same** hash identity regardless of integer `termsVersion`.
- A verifier that only checks `termsVersion === 1` while F17/F02 require a digest match **fails**.
- A claim that this residual landed as an SDS patch is rejected (`neo-defect-not-patched-on-sds`).

## Explicit

**not patched on SDS.** Neo is not writable from this pack.
