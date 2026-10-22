CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY CHECK(version=1));
INSERT OR IGNORE INTO schema_version VALUES(1);
CREATE TABLE IF NOT EXISTS tenants (
 id TEXT PRIMARY KEY, plan TEXT NOT NULL CHECK(plan IN ('free','paid')),
 entitlement_until INTEGER NOT NULL, subscription_ref TEXT, revoked INTEGER NOT NULL DEFAULT 0,
 checks INTEGER NOT NULL DEFAULT 0, charged_bytes INTEGER NOT NULL DEFAULT 0,
 charged_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS credentials (
 token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 role TEXT NOT NULL CHECK(role IN ('owner','reader'))
);
CREATE TABLE IF NOT EXISTS monitors (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 create_key TEXT NOT NULL, create_digest TEXT NOT NULL, config TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','paused','cancelled','expired','budget_exhausted')),
 generation INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 next_due INTEGER NOT NULL, current_run TEXT, core TEXT NOT NULL,
 checks INTEGER NOT NULL DEFAULT 0, charged_bytes INTEGER NOT NULL DEFAULT 0,
 charged_ms INTEGER NOT NULL DEFAULT 0, actual_bytes INTEGER NOT NULL DEFAULT 0,
 actual_ms INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0,
 unknown_runs INTEGER NOT NULL DEFAULT 0, delivery_attempts INTEGER NOT NULL DEFAULT 0,
 acknowledged INTEGER NOT NULL DEFAULT 0, event_floor INTEGER NOT NULL DEFAULT 0,
 initial_evidence TEXT, current_evidence TEXT,
 UNIQUE(tenant_id,create_key)
);
CREATE INDEX IF NOT EXISTS monitors_due ON monitors(status,next_due);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 slot INTEGER NOT NULL, generation INTEGER NOT NULL, lease_token TEXT NOT NULL,
 lease_until INTEGER NOT NULL, phase TEXT NOT NULL CHECK(phase IN ('claimed','started','staged','finished')),
 reserved_bytes INTEGER NOT NULL, reserved_ms INTEGER NOT NULL,
 started_at INTEGER NOT NULL, staged TEXT, outcome TEXT,
 UNIQUE(monitor_id,slot)
);
CREATE INDEX IF NOT EXISTS runs_recovery ON runs(phase,lease_until);
CREATE TABLE IF NOT EXISTS run_outputs (
 run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE, monitor_id TEXT NOT NULL,
 created_at INTEGER NOT NULL, document TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS run_outputs_immutable BEFORE UPDATE ON run_outputs
 BEGIN SELECT RAISE(ABORT,'immutable output'); END;
CREATE TABLE IF NOT EXISTS snapshots (
 monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 evidence_id TEXT NOT NULL, created_at INTEGER NOT NULL, document TEXT NOT NULL,
 PRIMARY KEY(monitor_id,evidence_id)
);
CREATE TRIGGER IF NOT EXISTS snapshots_immutable BEFORE UPDATE ON snapshots
 BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TABLE IF NOT EXISTS events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, before_evidence TEXT, after_evidence TEXT,
 document TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_monitor ON events(monitor_id,seq);
CREATE TRIGGER IF NOT EXISTS events_immutable BEFORE UPDATE ON events
 BEGIN SELECT RAISE(ABORT,'immutable event'); END;
CREATE TABLE IF NOT EXISTS deliveries (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 monitor_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL,
 acknowledged_at INTEGER, first_read_at INTEGER
);
CREATE TABLE IF NOT EXISTS delivery_attempts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, attempt INTEGER NOT NULL, retry_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS delivery_attempts_immutable BEFORE UPDATE ON delivery_attempts
 BEGIN SELECT RAISE(ABORT,'immutable attempt'); END;
CREATE TABLE IF NOT EXISTS source_gates (key TEXT PRIMARY KEY, next_at INTEGER NOT NULL);
