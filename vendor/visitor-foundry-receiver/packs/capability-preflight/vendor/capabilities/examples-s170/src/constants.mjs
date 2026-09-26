/**
 * BOT-S170 — customer-facing Cap journey recipe examples (thin demos).
 * Relative imports only into already-accepted Cap01/04/05/07/08 and journey-s162.
 */

export const SCHEMA = "pilot.r2.capabilities.examples_s170.v1";

export const BOT = "BOT-S170";

/** Docs-only quota reset timestamp (exact). */
export const QUOTA_RESET_UTC = "2026-09-10T12:48:15.801Z";
export const QUOTA_RESET_PT = "2026-09-10 05:48:15 PT";

/** Heavy pin already consumed by journey-s162 — do not re-fork Heavy trees. */
export const HEAVY_PIN_CONSUMED_BY_JOURNEY =
  "8a6716482b2f240078f7b17a3cf5547f1d122302";

/** Relative imports from examples-s170/src/ (or recipes/). */
export const CAP_IMPORTS = Object.freeze({
  cap01: "../../01/src/index.mjs",
  cap04: "../../04/src/index.mjs",
  cap05: "../../05/src/index.mjs",
  cap07: "../../07/src/index.mjs",
  cap08: "../../08/src/index.mjs",
  journeyS162: "../../journey-s162/src/index.mjs",
});

export const RECIPE_IDS = Object.freeze([
  "recipe-envelope",
  "recipe-cost-compare",
  "recipe-fallback",
  "recipe-context-pack",
  "recipe-walkthrough-lite",
]);

export const MUTATION_BOUNDARY =
  "Isolated feature-branch examples package only. Do not modify Cap internals, Heavy dirs, or journey-s162 core. S164 source residual is out of scope.";

export const DRY_RUN_NOTE =
  "Offline dry-run recipes only: no paid calls, no live network, no invent-green. Heavy pin already consumed by journey-s162.";

export const OUT_OF_SCOPE = Object.freeze([
  "S164 source residual fix (pending elsewhere — do not block; do not touch that path)",
  "Heavy S146 fork / Heavy tree copy-amend (already in branch from S162)",
  "Edits to Cap01/04/05/07/08 package internals",
  "Edits to journey-s162 core (read-only import OK)",
]);
