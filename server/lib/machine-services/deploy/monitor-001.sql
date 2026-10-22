CREATE SCHEMA IF NOT EXISTS pilot_monitor;
CREATE TABLE IF NOT EXISTS pilot_monitor.schema_identity (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), identity TEXT NOT NULL, version INTEGER NOT NULL CHECK(version=1)
);
INSERT INTO pilot_monitor.schema_identity VALUES(1,'sds.continuous-monitoring.pg.v1',1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tenants (
 id TEXT PRIMARY KEY, plan TEXT NOT NULL CHECK(plan IN ('free','paid')),
 entitlement_until BIGINT NOT NULL, subscription_ref TEXT, revoked BIGINT NOT NULL DEFAULT 0,
 checks BIGINT NOT NULL DEFAULT 0, charged_bytes BIGINT NOT NULL DEFAULT 0,
 charged_ms BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS credentials (
 token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 role TEXT NOT NULL CHECK(role IN ('owner','reader'))
);
CREATE TABLE IF NOT EXISTS monitors (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 create_key TEXT NOT NULL, create_digest TEXT NOT NULL, config TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','paused','cancelled','expired','budget_exhausted')),
 generation BIGINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 next_due BIGINT NOT NULL, current_run TEXT, core TEXT NOT NULL,
 checks BIGINT NOT NULL DEFAULT 0, charged_bytes BIGINT NOT NULL DEFAULT 0,
 charged_ms BIGINT NOT NULL DEFAULT 0, actual_bytes BIGINT NOT NULL DEFAULT 0,
 actual_ms BIGINT NOT NULL DEFAULT 0, requests BIGINT NOT NULL DEFAULT 0,
 unknown_runs BIGINT NOT NULL DEFAULT 0, delivery_attempts BIGINT NOT NULL DEFAULT 0,
 acknowledged BIGINT NOT NULL DEFAULT 0, event_floor BIGINT NOT NULL DEFAULT 0,
 initial_evidence TEXT, current_evidence TEXT,
 UNIQUE(tenant_id,create_key)
);
CREATE INDEX IF NOT EXISTS monitors_due ON monitors(status,next_due);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 slot BIGINT NOT NULL, generation BIGINT NOT NULL, lease_token TEXT NOT NULL,
 lease_until BIGINT NOT NULL, phase TEXT NOT NULL CHECK(phase IN ('claimed','started','staged','finished')),
 reserved_bytes BIGINT NOT NULL, reserved_ms BIGINT NOT NULL,
 started_at BIGINT NOT NULL, staged TEXT, outcome TEXT,
 UNIQUE(monitor_id,slot), UNIQUE(id,monitor_id)
);
CREATE INDEX IF NOT EXISTS runs_recovery ON runs(phase,lease_until);
CREATE TABLE IF NOT EXISTS run_outputs (
 run_id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL,
 created_at BIGINT NOT NULL, document TEXT NOT NULL,
 FOREIGN KEY(run_id,monitor_id) REFERENCES runs(id,monitor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snapshots (
 monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 evidence_id TEXT NOT NULL, created_at BIGINT NOT NULL, document TEXT NOT NULL,
 PRIMARY KEY(monitor_id,evidence_id)
);

CREATE TABLE IF NOT EXISTS events (
 seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 created_at BIGINT NOT NULL, before_evidence TEXT, after_evidence TEXT,
 document TEXT NOT NULL, UNIQUE(id,monitor_id)
);
CREATE INDEX IF NOT EXISTS events_monitor ON events(monitor_id,seq);

CREATE TABLE IF NOT EXISTS deliveries (
 event_id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 attempts BIGINT NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL,
 acknowledged_at BIGINT, first_read_at BIGINT,
 FOREIGN KEY(event_id,monitor_id) REFERENCES events(id,monitor_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS delivery_attempts (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 created_at BIGINT NOT NULL, attempt BIGINT NOT NULL, retry_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_gates (key TEXT PRIMARY KEY, next_at BIGINT NOT NULL);

CREATE OR REPLACE FUNCTION pilot_monitor.refuse_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable monitor artifact'; END $$;
DROP TRIGGER IF EXISTS run_outputs_immutable ON pilot_monitor.run_outputs;
CREATE TRIGGER run_outputs_immutable BEFORE UPDATE ON pilot_monitor.run_outputs
 FOR EACH ROW EXECUTE FUNCTION pilot_monitor.refuse_immutable_update();
DROP TRIGGER IF EXISTS snapshots_immutable ON pilot_monitor.snapshots;
CREATE TRIGGER snapshots_immutable BEFORE UPDATE ON pilot_monitor.snapshots
 FOR EACH ROW EXECUTE FUNCTION pilot_monitor.refuse_immutable_update();
DROP TRIGGER IF EXISTS events_immutable ON pilot_monitor.events;
CREATE TRIGGER events_immutable BEFORE UPDATE ON pilot_monitor.events
 FOR EACH ROW EXECUTE FUNCTION pilot_monitor.refuse_immutable_update();
DROP TRIGGER IF EXISTS delivery_attempts_immutable ON pilot_monitor.delivery_attempts;
CREATE TRIGGER delivery_attempts_immutable BEFORE UPDATE ON pilot_monitor.delivery_attempts
 FOR EACH ROW EXECUTE FUNCTION pilot_monitor.refuse_immutable_update();
