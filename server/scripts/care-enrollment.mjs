// Emit the reviewed, one-time enrollment SQL. Never connects to a database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { careSchema, careTable, careTables } from "../lib/care-database.js";

export const careMigrations = ["0011_task_requests.sql", "0012_care_orders.sql", "0013_task_quotes.sql",
  "0014_commerce_journey.sql", "0015_mail_events.sql", "0016_hosted_orders.sql", "0017_care_order_rail.sql", "0019_task_quote_rail.sql"];

function scopedMigration(file,schema) {
  const source = readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),"utf8");
  return source.replace(/\bpublic\.([a-z_]+)/g,(_,name)=>careTable(name,schema));
}

// Print only upgrade statements for an already-enrolled schema. No DB connection.
export function careRailUpgrade(schema) {
  careSchema({ SDS_CARE_SCHEMA:schema });
  return ["BEGIN;",...careMigrations.filter(file=>file === "0017_care_order_rail.sql" || file === "0019_task_quote_rail.sql")
    .map(file=>scopedMigration(file,schema)),"COMMIT;",""].join("\n");
}

export function careEnrollment(schema, role) {
  careSchema({ SDS_CARE_SCHEMA: schema });
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role) || role.startsWith("pg_") ||
      ["postgres", "anon", "authenticated", "service_role", "public"].includes(role)) throw new Error("Use a dedicated Care app role");
  const who = `"${role}"`;
  const sql = ["BEGIN;", `CREATE ROLE ${who} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `CREATE SCHEMA "${schema}";`, `REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC;`];
  for (const file of careMigrations) {
    sql.push(`-- ${file}`,scopedMigration(file,schema));
  }
  sql.push(`DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), '${role}'); END $$;`);
  sql.push(`GRANT USAGE ON SCHEMA "${schema}" TO ${who};`);
  for (const name of careTables) {
    const table = careTable(name, schema);
    sql.push(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`,
      `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`,
      `GRANT SELECT, INSERT, UPDATE ON TABLE ${table} TO ${who};`,
      `CREATE POLICY care_app_select ON ${table} FOR SELECT TO ${who} USING (true);`,
      `CREATE POLICY care_app_insert ON ${table} FOR INSERT TO ${who} WITH CHECK (true);`,
      `CREATE POLICY care_app_update ON ${table} FOR UPDATE TO ${who} USING (true) WITH CHECK (true);`);
  }
  sql.push(`DO $$ DECLARE browser_role text; BEGIN
    FOREACH browser_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
        EXECUTE format('REVOKE ALL ON SCHEMA "${schema}" FROM %I', browser_role);
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM %I', browser_role);
      END IF;
    END LOOP;
  END $$;`);
  // Never revoke shared PUBLIC privileges from unrelated objects. Refuse enrollment
  // if inherited PUBLIC grants would defeat this role boundary; Root resolves that scope.
  sql.push(`DO $$ BEGIN
    IF has_database_privilege('${role}', current_database(), 'CREATE') OR EXISTS (
      SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
      AND has_schema_privilege('${role}', oid, 'CREATE')
    ) THEN RAISE EXCEPTION 'Care role inherits schema DDL privileges; enrollment rolled back'; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema', '${schema}')
      AND c.relkind IN ('r','p','v','m','f')
      AND has_schema_privilege('${role}', n.oid, 'USAGE')
      AND (has_table_privilege('${role}', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    ) THEN RAISE EXCEPTION 'Care role inherits unrelated relation privileges; enrollment rolled back'; END IF;
  END $$;`, "COMMIT;");
  return sql.join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("Usage: node server/scripts/care-enrollment.mjs SCHEMA APP_ROLE > care-enrollment.sql");
  process.stdout.write(process.argv[2] === "--rail-upgrade" ? careRailUpgrade(process.argv[3]) : careEnrollment(process.argv[2], process.argv[3]));
}
