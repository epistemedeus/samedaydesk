CREATE SCHEMA IF NOT EXISTS pilot_gateway;
CREATE TABLE IF NOT EXISTS pilot_gateway.schema_identity (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), identity TEXT NOT NULL, version INTEGER NOT NULL CHECK(version=1)
);
INSERT INTO pilot_gateway.schema_identity VALUES(1,'sds.machine-gateway.pg.v1',1) ON CONFLICT DO NOTHING;
        CREATE TABLE IF NOT EXISTS quotes (
          id TEXT PRIMARY KEY, tenant TEXT NOT NULL, route_id TEXT NOT NULL,
          route_digest TEXT NOT NULL, input_digest TEXT NOT NULL, expires BIGINT NOT NULL,
          amount BIGINT NOT NULL, unit TEXT NOT NULL, version TEXT NOT NULL, UNIQUE(id,tenant)
        );
        CREATE TABLE IF NOT EXISTS usage (tenant TEXT PRIMARY KEY, calls BIGINT NOT NULL, units BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts (
          id TEXT PRIMARY KEY, tenant TEXT NOT NULL, idem TEXT NOT NULL, request_digest TEXT NOT NULL,
          quote_id TEXT NOT NULL UNIQUE, deadline BIGINT NOT NULL,
          active BIGINT NOT NULL, reservation BIGINT NOT NULL, possible BIGINT NOT NULL DEFAULT 0,
          body TEXT NOT NULL, UNIQUE(tenant, idem),
          FOREIGN KEY(quote_id,tenant) REFERENCES quotes(id,tenant)
        );
        CREATE TABLE IF NOT EXISTS credentials (identity TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id));
        CREATE INDEX IF NOT EXISTS active_attempts ON attempts(active, deadline, tenant);
