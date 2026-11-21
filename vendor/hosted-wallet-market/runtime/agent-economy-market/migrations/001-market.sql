-- Metadata beside the canonical earned-work kernel. No balance or debt table.
-- The controller substitutes only a validated, quoted schema identifier.
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_tasks (
  tenant_id text NOT NULL, id text NOT NULL, requester_id text NOT NULL,
  spec jsonb NOT NULL, request_digest text NOT NULL, version integer NOT NULL DEFAULT 0,
  current_quote text, selected_quote text, PRIMARY KEY (tenant_id,id)
);
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_interests (
  tenant_id text NOT NULL, task_id text NOT NULL, actor_id text NOT NULL,
  note text NOT NULL, PRIMARY KEY(tenant_id,task_id,actor_id),
  FOREIGN KEY(tenant_id,task_id) REFERENCES __SCHEMA__.ae14_market_tasks(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_quotes (
  tenant_id text NOT NULL, id text NOT NULL, task_id text NOT NULL,
  allocation_id text NOT NULL UNIQUE, command_digest text NOT NULL, binding jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,task_id) REFERENCES __SCHEMA__.ae14_market_tasks(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_assents (
  tenant_id text NOT NULL, quote_id text NOT NULL, actor_id text NOT NULL,
  quote_digest text NOT NULL, PRIMARY KEY(tenant_id,quote_id,actor_id),
  FOREIGN KEY(tenant_id,quote_id) REFERENCES __SCHEMA__.ae14_market_quotes(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_funding (
  chain text NOT NULL, token text NOT NULL, proof_id text NOT NULL,
  tenant_id text NOT NULL, allocation_id text NOT NULL, proof jsonb NOT NULL,
  PRIMARY KEY(chain,token,proof_id), UNIQUE(tenant_id,allocation_id)
);
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_consumers (
  tenant_id text NOT NULL, task_id text NOT NULL, actor_id text NOT NULL,
  PRIMARY KEY(tenant_id,task_id,actor_id),
  FOREIGN KEY(tenant_id,task_id) REFERENCES __SCHEMA__.ae14_market_tasks(tenant_id,id)
);
-- Voluntary export/use authority. Retained and paid grants stay on ae14_market_consumers.
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_voluntary_consumers (
  tenant_id text NOT NULL, task_id text NOT NULL, actor_id text NOT NULL,
  terms_digest text NOT NULL, artifact_digest text NOT NULL,
  granted_revision integer NOT NULL, operation_id text NOT NULL,
  PRIMARY KEY(tenant_id,task_id,actor_id),
  FOREIGN KEY(tenant_id,task_id) REFERENCES __SCHEMA__.ae14_market_tasks(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS __SCHEMA__.ae14_market_measures (
  tenant_id text NOT NULL, task_id text NOT NULL, kind text NOT NULL,
  event_id text NOT NULL, actor_id text NOT NULL, payload jsonb NOT NULL,
  PRIMARY KEY(tenant_id,task_id,kind,event_id),
  FOREIGN KEY(tenant_id,task_id) REFERENCES __SCHEMA__.ae14_market_tasks(tenant_id,id)
);
-- Optional voluntary continuation on the existing task authority. Old financial
-- rows/terms remain untouched; no zero-value obligation or funding row is made.
ALTER TABLE __SCHEMA__.ae14_market_tasks ADD COLUMN IF NOT EXISTS voluntary jsonb;
