export const SCHEMA = "neomorphic.r2.townsquare.first_conversation_task_kit.v1";
export const PACKAGE_ID = "R2-TOWNSQUARE-KIT-S170";
export const FORBIDDEN_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "reputation",
  "escrowBalance",
  "claimAuthority",
]);
export const CONSUMER_INSTRUCTIONS =
  "Unpack the zip, then: node src/cli.mjs demo  OR  node src/cli.mjs run fixtures/conversation.positive.json. " +
  "Requires Node 18+. Synthetic/demo only — fabricatedUsers=false, execute=false, adoptionRequired on proposed actions. " +
  "Root owns merge/publish/paid.";
