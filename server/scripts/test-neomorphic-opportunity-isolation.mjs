import test from "node:test";
import assert from "node:assert/strict";
import { inspectOpportunityEnv, OPPORTUNITY_SCHEMA } from "../lib/neomorphic-opportunity-mount.js";

const env = {
  NEOMORPHIC_OPPORTUNITY_DATABASE_URL: "postgresql://opportunity_app:test@DB.invalid:5432/retained?sslmode=verify-full",
  NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: "synthetic-opportunity-owner",
  CORRESPONDENCE_DATABASE_URL: "postgres://correspondence_app:test@db.invalid/retained",
  CORRESPONDENCE_PG_SCHEMA: "correspondence_fixture",
};

test("the retained database accepts distinct named application principals and schemas", () => {
  assert.equal(inspectOpportunityEnv(env).kind, "configured");
});

test("same authority aliases remain refused even with different passwords and options", () => {
  for (const url of [
    "postgres://opportunity_app:changed@db.invalid/retained",
    "postgres://placeholder:test@db.invalid/retained?user=opportunity_app",
    "postgres://%6fpportunity_app:test@db.invalid/retained",
  ]) assert.equal(inspectOpportunityEnv({ ...env, CORRESPONDENCE_DATABASE_URL: url }).kind, "invalid_config");
});

test("a missing or colliding correspondence schema does not establish separation", () => {
  for (const schema of [undefined, "", OPPORTUNITY_SCHEMA, "a;select"]) {
    assert.equal(inspectOpportunityEnv({ ...env, CORRESPONDENCE_PG_SCHEMA: schema }).kind, "invalid_config");
  }
});

test("an unspecified application principal or startup role override is not separate authority", () => {
  for (const url of [
    "postgres://db.invalid/retained",
    "postgres://different:test@db.invalid/retained?options=-c%20role%3Dopportunity_app",
    "postgres://different:test@db.invalid/retained?options=-c%20session_authorization%3Dopportunity_app",
  ]) assert.equal(inspectOpportunityEnv({ ...env, CORRESPONDENCE_DATABASE_URL: url }).kind, "invalid_config");
});

test("generic, earned-work and product-data isolation are not relaxed", () => {
  assert.equal(inspectOpportunityEnv({ ...env, DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL }).kind, "invalid_config");
  assert.equal(inspectOpportunityEnv({ ...env, EARNED_WORK_DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL }).kind, "invalid_config");
  assert.equal(inspectOpportunityEnv({ ...env,
    NEOMORPHIC_OPPORTUNITY_DATABASE_URL: "postgres://opportunity_app.arvmcttdegqwiwdaembr:test@aws-0-us-east-2.pooler.supabase.com/postgres",
  }).kind, "invalid_config");
});
