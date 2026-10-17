import pg from "pg";
import { fanout } from "./fanout.mjs";
import { quantile } from "./metrics.mjs";
import {
  AXES,
  BACKLOG_ITEMS_PER_CLIENT,
  CLUSTER,
  CORPUS_BODY_BYTES,
  CORPUS_ROWS_PER_CLIENT,
  OFFERED_CLIENTS,
  WORKLOAD_PLAN,
  corpusBody,
  unitsFor,
} from "./plan.mjs";
import { redactSecrets } from "./redact.mjs";
import { classifyCell } from "./status.mjs";

const BODY = corpusBody();

function veil(err, secrets) {
  return new Error(redactSecrets(err.message || String(err), secrets));
}

async function migrate(owner, clientPassword, secrets) {
  if (!/^[0-9a-f]{48}$/.test(clientPassword)) throw new Error("client password generator failed");
  const statements = [
    "CREATE SCHEMA vf17_qual",
    `CREATE TABLE vf17_qual.holders (
      slot integer PRIMARY KEY CHECK (slot >= 0)
    )`,
    `CREATE TABLE vf17_qual.corpus (
      client_slot integer NOT NULL CHECK (client_slot >= 0),
      seq integer NOT NULL CHECK (seq >= 0),
      body text NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 4096),
      PRIMARY KEY (client_slot, seq)
    )`,
    `CREATE TABLE vf17_qual.backlog (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      client_slot integer NOT NULL CHECK (client_slot >= 0),
      seq integer NOT NULL CHECK (seq >= 0),
      state text NOT NULL CHECK (state IN ('queued', 'done')),
      UNIQUE (client_slot, seq)
    )`,
    `CREATE ROLE vf17_client LOGIN PASSWORD '${clientPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    "GRANT CONNECT ON DATABASE postgres TO vf17_client",
    "GRANT USAGE ON SCHEMA vf17_qual TO vf17_client",
    "GRANT SELECT, INSERT ON vf17_qual.holders TO vf17_client",
    "GRANT SELECT, INSERT ON vf17_qual.corpus TO vf17_client",
    "GRANT SELECT, UPDATE ON vf17_qual.backlog TO vf17_client",
  ];
  try {
    for (const statement of statements) await owner.query(statement);
  } catch (err) {
    throw veil(err, secrets);
  }
}

async function expectReject(owner, label, sql, params) {
  try {
    await owner.query(sql, params);
    return { label, rejected: false, sqlstate: null };
  } catch (err) {
    await owner.query("ROLLBACK").catch(() => {});
    return { label, rejected: err.code === "23514", sqlstate: err.code ?? null };
  }
}

async function runPoisons(owner) {
  const seeded = [];
  seeded.push(await expectReject(
    owner,
    "empty-corpus-body",
    "INSERT INTO vf17_qual.corpus(client_slot, seq, body) VALUES (0, 0, '')",
  ));
  seeded.push(await expectReject(
    owner,
    "negative-corpus-slot",
    "INSERT INTO vf17_qual.corpus(client_slot, seq, body) VALUES (-1, 0, 'x')",
  ));
  seeded.push(await expectReject(
    owner,
    "backlog-state-live",
    "INSERT INTO vf17_qual.backlog(client_slot, seq, state) VALUES (0, 0, 'live')",
  ));
  const counts = await owner.query(
    `SELECT
      (SELECT count(*)::int FROM vf17_qual.corpus) AS corpus,
      (SELECT count(*)::int FROM vf17_qual.backlog) AS backlog`,
  );
  return { seeded, leftover: counts.rows[0] };
}

async function readSettings(owner) {
  const result = await owner.query(
    `SELECT name, setting, unit
     FROM pg_settings
     WHERE name IN (
       'max_connections',
       'superuser_reserved_connections',
       'shared_buffers',
       'work_mem',
       'fsync',
       'synchronous_commit',
       'listen_addresses',
       'port'
     )
     ORDER BY name`,
  );
  const settings = {};
  const units = {};
  for (const row of result.rows) {
    settings[row.name] = row.setting;
    units[row.name] = row.unit;
  }
  return { settings, units };
}

function settingBytes(setting, unit) {
  const value = Number(setting);
  const scale = { "8kB": 8192, kB: 1024, MB: 1024 * 1024, GB: 1024 ** 3 };
  if (!Number.isFinite(value) || scale[unit] === undefined) return null;
  return value * scale[unit];
}

function assertCluster(observed) {
  const { settings, units } = observed;
  if (settings.max_connections !== String(CLUSTER.maxConnections)) {
    throw new Error(`disposable cluster max_connections is ${settings.max_connections}, expected ${CLUSTER.maxConnections}`);
  }
  if (settings.listen_addresses !== CLUSTER.listenHost) {
    throw new Error(`disposable cluster listen_addresses is ${settings.listen_addresses}`);
  }
  if (settings.fsync !== "on" || settings.synchronous_commit !== "on") {
    throw new Error("disposable cluster durability settings are not on");
  }
  const shared = settingBytes(settings.shared_buffers, units.shared_buffers);
  const work = settingBytes(settings.work_mem, units.work_mem);
  if (shared !== 32 * 1024 * 1024) throw new Error(`shared_buffers is ${shared} bytes`);
  if (work !== 2 * 1024 * 1024) throw new Error(`work_mem is ${work} bytes`);
}

async function roles(owner) {
  const result = await owner.query(
    "SELECT rolname, rolsuper FROM pg_roles WHERE rolname IN ('vf17_owner', 'vf17_client') ORDER BY rolname",
  );
  const byName = Object.fromEntries(result.rows.map((row) => [row.rolname, row.rolsuper]));
  if (byName.vf17_owner !== true || byName.vf17_client !== false) {
    throw new Error("vf17_client must be NOSUPERUSER and vf17_owner must be the cluster superuser");
  }
  return { ownerIsSuperuser: true, clientIsSuperuser: false };
}

function summarize(axis, offeredClients, fan, extra) {
  const completed = fan.results.filter((row) => row.outcome === "completed");
  const refused = fan.results.filter((row) => row.outcome === "refused");
  const unknown = fan.results.filter((row) => row.outcome === "unknown");
  const errorCodes = {};
  const errorSamples = {};
  for (const row of [...refused, ...unknown]) {
    const code = row.code || "unknown";
    errorCodes[code] = (errorCodes[code] ?? 0) + 1;
    if (!errorSamples[code] && row.message) errorSamples[code] = row.message;
  }
  const limits = new Set(refused.map((row) => row.limit).filter(Boolean));
  const cell = {
    id: `${axis}:${offeredClients}`,
    axis,
    offeredClients,
    acquiredClients: completed.length,
    refusedClients: refused.length,
    unknownClients: unknown.length,
    holderRows: fan.holderRows,
    offeredUnits: unitsFor(axis, offeredClients),
    actualUnits: extra.actualUnits,
    actualBytes: extra.actualBytes ?? null,
    leftover: extra.leftover ?? 0,
    badRows: extra.badRows ?? 0,
    accountingMismatch: extra.accountingMismatch === true,
    elapsedMs: extra.elapsedMs,
    p50Ms: quantile(completed.map((row) => row.ms), 0.5),
    p95Ms: quantile(completed.map((row) => row.ms), 0.95),
    errorCodes,
    errorSamples,
    limit: limits.size === 1 ? [...limits][0] : null,
  };
  cell.status = classifyCell(cell);
  const opened = completed.length + unknown.filter((row) => row.phase === "work").length;
  if (cell.holderRows !== opened) cell.accountingMismatch = true;
  if (cell.accountingMismatch) cell.status = "failed";
  return cell;
}

async function holderCount(owner) {
  const result = await owner.query("SELECT count(*)::int AS n FROM vf17_qual.holders");
  return result.rows[0].n;
}

async function resetHolders(owner) {
  await owner.query("TRUNCATE vf17_qual.holders");
}

async function waitForClientsGone(owner) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const result = await owner.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'vf17-offered'",
    );
    if (result.rows[0].n === 0) return;
    if (Date.now() > deadline) {
      throw new Error(`offered clients still connected: ${result.rows[0].n}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const acquireHolder = (client, slot) => client.query(
  "INSERT INTO vf17_qual.holders(slot) VALUES ($1)",
  [slot],
);

export async function runQualification(handle, hooks = {}) {
  const secrets = handle.secrets ?? [];
  const owner = new pg.Client({
    host: handle.owner.host,
    port: handle.owner.port,
    user: handle.owner.user,
    password: handle.owner.password,
    database: handle.owner.database,
    application_name: "vf17-owner",
    connectionTimeoutMillis: 4000,
  });
  await owner.connect();
  try {
    await migrate(owner, handle.client.password, secrets);
    const roleState = await roles(owner);
    const observed = await readSettings(owner);
    assertCluster(observed);
    const poison = await runPoisons(owner);
    const cells = [];
    for (const offered of OFFERED_CLIENTS) {
      for (const axis of AXES) {
        const cell = await runCell(owner, handle.client, axis, offered);
        cells.push(cell);
        hooks.onCell?.(cell);
      }
    }
    const poisonFailed = poison.seeded.some((row) => !row.rejected) || poison.leftover.corpus !== 0 || poison.leftover.backlog !== 0;
    const cellFailed = cells.some((cell) => cell.status === "failed");
    let failureReason = null;
    if (poisonFailed) failureReason = "seeded SQL constraint was not rejected";
    else if (cellFailed) {
      failureReason = `failed cells: ${cells.filter((cell) => cell.status === "failed").map((cell) => cell.id).join(", ")}`;
    }
    return {
      schema: "sds.vf17.host-qualification.report.v1",
      status: poisonFailed || cellFailed ? "failed" : "complete",
      failureReason,
      traffic: "synthetic",
      silentReduction: false,
      hostingerMeasured: false,
      workloadPlan: WORKLOAD_PLAN,
      cluster: {
        version: handle.version,
        pid: handle.pid,
        listen: { host: handle.owner.host, port: handle.owner.port },
        settings: observed.settings,
        units: observed.units,
        roles: roleState,
        ownerSessionDuringFanout: 1,
      },
      seededRejections: poison.seeded,
      cells,
    };
  } finally {
    await owner.end().catch(() => {});
  }
}

async function runCell(owner, clientConfig, axis, offered) {
  const started = performance.now();
  await waitForClientsGone(owner);
  await resetHolders(owner);
  if (axis === "concurrency") {
    const fan = await fanout({
      offered,
      clientConfig,
      acquire: acquireHolder,
      sample: () => holderCount(owner),
      run: (client) => client.query("SELECT 1 AS ok").then(() => ({})),
    });
    return summarize(axis, offered, fan, {
      actualUnits: fan.results.filter((row) => row.outcome === "completed").length,
      elapsedMs: Math.round(performance.now() - started),
    });
  }
  if (axis === "corpus") {
    await owner.query("TRUNCATE vf17_qual.corpus");
    const fan = await fanout({
      offered,
      clientConfig,
      acquire: acquireHolder,
      sample: () => holderCount(owner),
      run: (client, slot) => client.query(
        `INSERT INTO vf17_qual.corpus(client_slot, seq, body)
         SELECT $1::int, seq, $2::text FROM generate_series(0, $3::int - 1) AS seq`,
        [slot, BODY, CORPUS_ROWS_PER_CLIENT],
      ).then((result) => ({ rows: result.rowCount })),
    });
    const counted = await owner.query(
      `SELECT count(*)::int AS rows,
              coalesce(sum(octet_length(body)), 0)::int AS bytes,
              count(*) FILTER (WHERE octet_length(body) <> $1)::int AS bad
       FROM vf17_qual.corpus`,
      [CORPUS_BODY_BYTES],
    );
    const reported = fan.results.reduce((sum, row) => sum + (row.rows ?? 0), 0);
    const { rows, bytes, bad } = counted.rows[0];
    return summarize(axis, offered, fan, {
      actualUnits: rows,
      actualBytes: bytes,
      badRows: bad,
      accountingMismatch: reported !== rows || bytes !== rows * CORPUS_BODY_BYTES,
      elapsedMs: Math.round(performance.now() - started),
    });
  }
  if (axis === "backlog") {
    await owner.query("TRUNCATE vf17_qual.backlog RESTART IDENTITY");
    const depth = offered * BACKLOG_ITEMS_PER_CLIENT;
    const enqueued = await owner.query(
      `INSERT INTO vf17_qual.backlog(client_slot, seq, state)
       SELECT slot::int, seq::int, 'queued'
       FROM generate_series(0, $1::int - 1) AS slot
       CROSS JOIN generate_series(0, $2::int - 1) AS seq`,
      [offered, BACKLOG_ITEMS_PER_CLIENT],
    );
    const fan = await fanout({
      offered,
      clientConfig,
      acquire: acquireHolder,
      sample: () => holderCount(owner),
      run: async (client) => {
        let drained = 0;
        for (;;) {
          const result = await client.query(
            `UPDATE vf17_qual.backlog
             SET state = 'done'
             WHERE id = (
               SELECT id FROM vf17_qual.backlog
               WHERE state = 'queued'
               ORDER BY id
               FOR UPDATE SKIP LOCKED
               LIMIT 1
             )
             RETURNING id`,
          );
          if (result.rowCount === 0) break;
          drained += result.rowCount;
        }
        return { drained };
      },
    });
    const counted = await owner.query(
      `SELECT count(*) FILTER (WHERE state = 'done')::int AS done,
              count(*) FILTER (WHERE state <> 'done')::int AS leftover,
              count(*)::int AS total
       FROM vf17_qual.backlog`,
    );
    const reported = fan.results.reduce((sum, row) => sum + (row.drained ?? 0), 0);
    const { done, leftover, total } = counted.rows[0];
    return summarize(axis, offered, fan, {
      actualUnits: done,
      leftover,
      accountingMismatch: enqueued.rowCount !== depth || reported !== done || total !== depth,
      elapsedMs: Math.round(performance.now() - started),
    });
  }
  throw new Error(`unknown axis ${axis}`);
}
