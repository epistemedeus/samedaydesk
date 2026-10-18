import {readFileSync} from 'node:fs';
import {scryptSync, randomBytes} from 'node:crypto';
import https from 'node:https';
import pg from 'pg';
import {assertAdmitted} from './admission.mjs';
import {digest} from './canonical.mjs';
import {createCanonicalReceiving} from './canonical-receiving.mjs';
import {readAccountCode, readBaseTokenDecimals, readConfiguredChain, readPublicChain, verifyDeposit} from './chain.mjs';
import {continuityEvidence} from './evidence.mjs';
import {pendingRegistryDisposition} from './discharge-authority.mjs';
import {quoteEconomics, ROUNDING_PROFILE} from './fee.mjs';
import {addressOf, id, sha256} from './ids.mjs';
import {assertObligationGuard, inspectInstallation} from './migrate.mjs';
import {assertImportShape, createInstalledDebtConsumer, IMPORT_BODY_KEYS} from './native-debt.mjs';
import {loadOwnerAuthority} from './owner-authority.mjs';
import {frozenMarker} from './preserve.mjs';
import {ADDITIVE_ENV_KEYS, loadDeploymentProfile} from './profile.mjs';
import {publicFieldLeaks} from './public-text.mjs';
import {protectNativeMarket} from './native-market-privacy.mjs';
import {assertReplayKey, openSecrets, sealSecrets} from './seal.mjs';
import {readEntitledOutcome} from './retained-outcome.mjs';
import {fundingIntentMessage, recoverPersonalSigner} from './signature.mjs';

export const PREFIX = '/api/neomorphic-contributor-journey';
export const WIRE_VERSION = 'c0-1';
export const WIRE_HEADER = 'x-ae-wire-version';
const SERVER_CLASS_HEADER = 'x-ae-server-class';
const TASK_ID = /^task_[A-Za-z0-9_-]{16}$/;
const RESERVATION_ID = /^rsv_[A-Za-z0-9_-]{16}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_.:#-]{7,160}$/;

function httpError(status, code) {
  return Object.assign(new Error(code), {http: status, codeName: code});
}

function keysOf(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'json_required');
  const keys = Object.keys(body);
  if (keys.some(key => !allowed.includes(key)) || allowed.some(key => body[key] === undefined && key !== 'proofId' && key !== 'payoutDestination')) {
    if (keys.includes('feeRecipient') && !allowed.includes('feeRecipient')) throw httpError(409, 'recipient_frozen');
    if (keys.includes('redirectTo')) throw httpError(409, 'recipient_frozen');
    throw httpError(400, 'body_refused');
  }
}

function must(value, code, status = 400) {
  if (!value) throw httpError(status, code);
}

function asObject(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function mapError(error) {
  if (error?.http && error?.codeName) return error;
  const named = error?.codeName || error?.code;
  if (['chain_refused', 'chain_unreachable', 'chain_rpc_refused', 'chain_url_refused', 'chain_method_refused', 'deposit_unverified', 'payer_unbound', 'funding_refused'].includes(named)) {
    return httpError(409, named);
  }
  if (error?.code === '23505') {
    const constraint = String(error.constraint || '');
    if (constraint === 'quotes_funding_evidence_key') return httpError(409, 'funding_proof_reused');
    if (constraint === 'native_debt_transfer_allocation') return httpError(409, 'transfer_already_allocated');
    if (constraint === 'native_debt_reservation_allocation') return httpError(409, 'reservation_already_allocated');
    if (constraint.includes('reservation')) return httpError(409, 'slot_taken');
    if (constraint.includes('proof')) return httpError(409, 'proof_reused');
    if (constraint.includes('capture') || constraint.includes('obligation')) return httpError(409, 'winner_already_recorded');
    return httpError(409, 'conflict');
  }
  if (error?.code === '23514' && String(error.constraint || '').startsWith('native_debt')) {
    return httpError(409, 'disposition_hold');
  }
  if (error?.code === '23514' && String(error.constraint || '').startsWith('consumer_enrollment')) {
    return httpError(409, 'enrollment_conflict');
  }
  if (error?.code === 'P0001') {
    const message = String(error.message || '');
    if (message.includes('obligation_immutable')) return httpError(409, 'obligation_immutable');
    if (message.includes('disposition_hold')) return httpError(409, 'disposition_hold');
    if (message.includes('disposition_immutable')) return httpError(409, 'disposition_immutable');
    if (message.includes('enrollment_immutable')) return httpError(409, 'enrollment_immutable');
    if (message.includes('succession_immutable')) return httpError(409, 'succession_immutable');
    if (message.includes('legacy_debt_immutable')) return httpError(409, 'legacy_debt_immutable');
    if (message.includes('preserved_key_overlap')) return httpError(409, 'preserved_key_overlap');
    return httpError(409, 'constraint_refused');
  }
  return error;
}

function passwordRecord(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, {N: 16384, r: 8, p: 1});
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function pem(value) {
  if (Buffer.isBuffer(value)) return value;
  return readFileSync(value);
}

export async function openHostedMarket(options) {
  const profile = loadDeploymentProfile({
    mode: options.mode,
    label: options.label,
    chain: options.chain,
    payments: options.payments,
    publicReads: options.publicReads,
    fundedTasks: options.fundedTasks,
    humanAssets: options.humanAssets,
    tls: options.tls,
    origin: options.origin,
    tenant: options.tenant,
    databaseUrl: options.databaseUrl,
    rpcUrl: options.rpcUrl,
    earnedSchema: options.earnedSchema,
    schemaName: options.schemaName,
    listenHost: options.listenHost,
    cert: options.cert,
    key: options.key,
    // The SDS mount forwards the fields it already knows. These two addresses
    // are read from the process environment when that mount omits them.
    feeRecipient: options.feeRecipient ?? process.env.HOSTED_WALLET_MARKET_FEE_RECIPIENT,
    settlementToken: options.settlementToken ?? process.env.HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN,
  }, {listen: false});
  if (!options.rpcUrl) throw Object.assign(new Error('chain_url_refused'), {codeName: 'chain_url_refused'});
  if (options.contract) assertAdmitted(options.contract.names, ADDITIVE_ENV_KEYS);
  const quoteTtlMs = options.quoteTtlMs ?? 3600000;
  const claimTtlSeconds = options.claimTtlSeconds ?? 7200;
  if (!Number.isFinite(quoteTtlMs) || quoteTtlMs < 1000) throw Object.assign(new Error('quote_ttl_refused'), {codeName: 'quote_ttl_refused'});
  if (!Number.isInteger(claimTtlSeconds) || claimTtlSeconds < 1 || claimTtlSeconds > 86400) {
    throw Object.assign(new Error('claim_ttl_refused'), {codeName: 'claim_ttl_refused'});
  }
  const replayKey = options.replayKey ?? process.env.CONTRIBUTOR_JOURNEY_REPLAY_KEY;
  assertReplayKey(replayKey);
  const ownerAuthority = options.ownerAuthority || (options.sdsRoot ? await loadOwnerAuthority(options.sdsRoot,{ownerToken:options.ownerToken}) : null);
  const dropOnce = options.dropOnce instanceof Set ? options.dropOnce : new Set();
  const originBox = {origin: profile.origin || ''};
  const nowMs = () => {
    const value = options.now ? options.now() : Date.now();
    if (!Number.isFinite(value)) throw httpError(500, 'clock_refused');
    return value;
  };
  const nowDate = () => new Date(nowMs());
  async function forgetExpired(client) {
    await client.query(
      `UPDATE earned_work_idempotency
       SET response_json = response_json - 'sealed'
       WHERE scope = 'hosted-wallet-market'
         AND jsonb_exists(response_json, 'sealed')
         AND (response_json #>> '{sealed,expiresAt}')::timestamptz <= $1`,
      [nowDate()],
    );
  }
  const observation = {blockNumber: null, remoteRead: null, remoteDecimals: null};
  const dischargeRegistry = options.dischargeRegistry ?? process.env.HOSTED_WALLET_MARKET_DISCHARGE_REGISTRY;
  const debtConsumer = createInstalledDebtConsumer({profile, sdsRoot: options.sdsRoot,
    registryRoot: dischargeRegistry,
    authorityPrincipalId: ownerAuthority?.principalId,
    readAcceptedSource: options.readAcceptedSource});
  let observed;
  try {
    observed = profile.publicChain
      ? await readPublicChain(options.rpcUrl, profile.chain)
      : await readConfiguredChain(options.rpcUrl, profile.chain);
    observation.blockNumber = observed.blockNumber;
    if (profile.publicChain) {
      observation.remoteRead = 'eth_call';
      observation.remoteDecimals = await readBaseTokenDecimals(options.rpcUrl, profile.chain);
    }
  } catch (error) {
    throw error;
  }

  const pool = new pg.Pool({
    connectionString: options.databaseUrl,
    max: 6,
    application_name: 'root71-hosted-wallet-market',
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', () => {});
  function qualify(client) {
    return {
      query(sql, params) {
        return client.query(String(sql).replaceAll('cj227_earned_work', profile.earnedSchema), params);
      },
    };
  }
  async function withClient(fn) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${profile.earnedSchema}`);
      return await fn(qualify(client));
    } finally {
      client.release();
    }
  }
  async function withTx(fn) {
    return withClient(async client => {
      await client.query('BEGIN');
      try {
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* aborted */ }
        if (error?.codeName === 'recovery_expired') await forgetExpired(client);
        throw error;
      }
    });
  }

  try {
    const shape = await withClient(client => inspectInstallation(client, {earnedSchema: profile.earnedSchema}));
    if (!shape.obligationColumnsMatch || !shape.legacyTrigger || shape.configValuesCopied) {
      throw Object.assign(new Error('installation_refused'), {codeName: 'installation_refused'});
    }
    const owed = shape.payoutChecks.some(row => String(row.definition).includes("payout_state = 'owed'") || String(row.definition).includes('capture_evidence'));
    if (!owed) throw Object.assign(new Error('installation_refused'), {codeName: 'installation_refused'});
    await withClient(client => assertObligationGuard(client, {earnedSchema: profile.earnedSchema}));
    await withClient(async client => {
      const found = await client.query(
        'SELECT tenant, earned_schema, chain, payments FROM hosted_wallet_market.installation WHERE id = TRUE',
      );
      if (!found.rows.length) {
        await client.query(
          `INSERT INTO hosted_wallet_market.installation (id, tenant, earned_schema, chain, payments)
           VALUES (TRUE, $1, $2, $3, 'off')`,
          [profile.tenant, profile.earnedSchema, profile.chain],
        );
      } else {
        const row = found.rows[0];
        if (row.tenant !== profile.tenant || row.earned_schema !== profile.earnedSchema || row.chain !== profile.chain || row.payments !== 'off') {
          throw Object.assign(new Error('tenant_refused'), {codeName: 'tenant_refused'});
        }
      }
    });
  } catch (error) {
    await pool.end();
    throw error;
  }

  const send = (res, status, body, extra = {}) => {
    if (res.destroyed || res.writableEnded) return;
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(payload.length),
      connection: 'close',
      'cache-control': 'no-store',
      [WIRE_HEADER]: WIRE_VERSION,
      [SERVER_CLASS_HEADER]: 'live',
      ...extra,
    });
    res.end(payload);
  };

  const readJson = req => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) reject(httpError(400, 'body_too_large'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(httpError(400, 'json_required')); }
    });
    req.on('error', () => reject(httpError(400, 'body_interrupted')));
  });

  async function accountFrom(client, req, {write = false} = {}) {
    const cookie = req.headers.cookie?.split(';')[0]?.trim();
    if (!cookie) throw httpError(401, 'unauthenticated');
    const rows = await client.query(
      `SELECT s.revoked_at, s.expires_at, s.auth_version, a.auth_version AS current_auth_version, a.id AS account_id, r.role, d.csrf, d.cookie_hash
       FROM journey_account_sessions s
       JOIN journey_accounts a ON a.id = s.account_id
       JOIN hosted_wallet_market.roles r ON r.account_id = a.id
       JOIN hosted_wallet_market.session_delivery d ON d.account_id = a.id
       WHERE s.token_hash = $1 OR s.token_hash = $2`,
      [sha256(cookie),sha256(cookie.slice(cookie.indexOf('=')+1))],
    );
    const row = rows.rows[0];
    if (!row || row.cookie_hash !== sha256(cookie)) throw httpError(401, 'unauthenticated');
    if (row.revoked_at || row.auth_version !== row.current_auth_version || row.expires_at.getTime() <= nowMs()) throw httpError(401, 'revoked');
    if (write) {
      if (req.headers.origin !== originBox.origin) throw httpError(401, 'origin_required');
      if (req.headers['x-cj-csrf'] !== row.csrf) throw httpError(401, 'csrf_required');
    }
    return {accountId: row.account_id, role: row.role, csrf: row.csrf, cookie};
  }

  // The legacy private profile is retained. A separately source-qualified
  // machine capability admits discovery; only the closed rail authority can
  // admit disposable-chain money. A profile flag never supplies a signer.
  let machine;
  const machineInput = options.machineProfile ?? process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
  if (machineInput) {
    try {
      const {readMachineCapability, openMachineMarket} = await import('./machine-market.mjs');
      const capability = readMachineCapability(machineInput, {sdsRoot: options.sdsRoot,
        origin: profile.origin || options.origin, tenant: profile.tenant});
      originBox.origin = capability.origin;
      machine = await openMachineMarket({capability, authority: options.machineAuthority,
        sdsRoot: options.sdsRoot, profile: {...profile,replayKey}, now: nowMs, withClient,
        authenticate: (req, policy) => withClient(c => accountFrom(c, req, policy))});
    } catch (error) { await pool.end(); throw error; }
  }

  async function mutate(client, req, body, account, apply) {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !IDEMPOTENCY.test(key)) throw httpError(400, 'idempotency_required');
    const route = new URL(req.originalUrl || req.url, 'https://local.invalid').pathname;
    const requestHash = digest({method: req.method, route, body});
    // Absent idempotency rows cannot be locked by SELECT FOR UPDATE.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`hosted-wallet-market:${key}`]);
    const existing = await client.query(
      `SELECT request_hash, response_json, principal_id FROM earned_work_idempotency
       WHERE scope = 'hosted-wallet-market' AND task_id = '' AND key = $1 FOR UPDATE`,
      [key],
    );
    if (existing.rows[0]) {
      const stored = existing.rows[0];
      const wrapper = asObject(stored.response_json);
      if (account) {
        if (!stored.principal_id || stored.principal_id !== account.accountId) throw httpError(404, 'not_found');
      } else if (wrapper.proofHash !== sha256(String(req.headers['x-account-operation-proof'] || ''))) {
        throw httpError(404, 'not_found');
      }
      if (stored.request_hash !== requestHash) throw httpError(409, 'immutable_operation_input_changed');
      const value = wrapper.value && typeof wrapper.value === 'object' && !Array.isArray(wrapper.value) ? {...wrapper.value} : wrapper.value;
      let cookie = null;
      if (wrapper.sealed) {
        const opened = openSecrets(replayKey, wrapper.sealed, nowMs());
        if (!opened) throw Object.assign(httpError(409, 'recovery_expired'), {wipeKey: key});
        cookie = opened.cookie;
        if (value && typeof value === 'object') value.recoveryCode = opened.recoveryCode;
      }
      return {key, value, cookie, csrf: wrapper.csrf, replay: true};
    }
    const produced = await apply(client);
    const publicValue = produced.value && typeof produced.value === 'object' && !Array.isArray(produced.value) && Object.hasOwn(produced.value, 'recoveryCode')
      ? Object.fromEntries(Object.entries(produced.value).filter(([name]) => name !== 'recoveryCode'))
      : produced.value;
    const wrapper = {value: publicValue};
    if (produced.csrf) wrapper.csrf = produced.csrf;
    if (produced.proofHash) wrapper.proofHash = produced.proofHash;
    if (produced.cookie || produced.value?.recoveryCode) {
      wrapper.sealed = sealSecrets(replayKey, {recoveryCode: produced.value.recoveryCode, cookie: produced.cookie}, nowMs());
    }
    await client.query(
      `INSERT INTO earned_work_idempotency
        (scope, task_id, key, request_hash, status_code, response_json, principal_id, created_at)
       VALUES ('hosted-wallet-market', '', $1, $2, 200, $3::jsonb, $4, $5)`,
      [key, requestHash, JSON.stringify(wrapper), produced.accountId || account?.accountId || '', nowDate()],
    );
    return {key, value: produced.value, cookie: produced.cookie, csrf: produced.csrf, replay: false};
  }

  function cookieHeaders(pair, csrf) {
    return {
      'set-cookie': `${pair}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400`,
      'x-cj-csrf': csrf,
    };
  }

  function finish(res, produced, extra = {}) {
    if (produced.key && dropOnce.has(produced.key)) {
      // In-process staging hook only. The bin never supplies this set, and it runs after COMMIT.
      if (options.label !== 'STAGING') throw httpError(500, 'drop_refused');
      dropOnce.delete(produced.key);
      res.destroy();
      return;
    }
    const headers = {...extra};
    if (produced.cookie) Object.assign(headers, cookieHeaders(produced.cookie, produced.csrf));
    send(res, 200, {ok: true, value: produced.value}, headers);
  }

  function quoteValue(quote) {
    const economics = asObject(quote.economics);
    const authorizationExpiry = quote.authorization_expiry.toISOString();
    const refundExpiry = quote.refund_expiry.toISOString();
    return {
      ...economics,
      quoteId: `quo_${quote.task_id.slice(5)}`,
      taskId: quote.task_id,
      feeRecipient: quote.fee_recipient,
      termsVersion: quote.terms_version,
      fundingState: quote.funding_wire,
      funded: quote.funded === true,
      // Wire "reserved" means a contributor slot was reserved by the observation.
      // earned_work funding_state 'reserved' is the verified-deposit column and is not this flag.
      reserved: false,
      authorizationExpiry,
      refundExpiry,
      expiriesEqual: authorizationExpiry === refundExpiry,
      frozen: true,
      contributorId: quote.contributor_account_id,
      payoutDestination: quote.payout_destination,
    };
  }

  async function event(client, taskId, kind, payload) {
    const seq = await client.query(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM cj227_earned_work.earned_work_events WHERE task_id = $1',
      [taskId],
    );
    await client.query(
      `INSERT INTO cj227_earned_work.earned_work_events (id, task_id, sequence, kind, payload, created_at)
       VALUES ($1, $2, $3::bigint, $4, $5::jsonb, $6)`,
      [id('evt_'), taskId, seq.rows[0].n, kind, JSON.stringify(payload), nowDate()],
    );
  }

  async function loadQuote(client, taskId, lock = false) {
    const rows = await client.query(
      `SELECT * FROM hosted_wallet_market.quotes WHERE task_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [taskId],
    );
    return rows.rows[0] || null;
  }

  function sourceOf(delivery, reservation) {
    return {
      taskId: reservation.task_id,
      reservationId: reservation.id,
      termsVersion: reservation.terms_version,
      evidenceHash: delivery ? delivery.evidence_hash : null,
      businessStatus: delivery ? delivery.business_status : null,
    };
  }

  async function reservationView(client, reservationId) {
    const rows = await client.query(
      `SELECT r.*, q.requester_account_id, g.account_id AS contributor_account_id, d.evidence_hash, d.business_status, d.raw_sha256
       FROM cj227_earned_work.earned_work_reservations r
       JOIN hosted_wallet_market.quotes q ON q.task_id = r.task_id
       LEFT JOIN hosted_wallet_market.grants g ON g.task_id = r.task_id AND g.token_id = r.contributor_token_id
       LEFT JOIN hosted_wallet_market.delivery d ON d.reservation_id = r.id
       WHERE r.id = $1`,
      [reservationId],
    );
    return rows.rows[0] || null;
  }

  function visible(account, row) {
    if (!row) return false;
    if (account.role === 'requester') return row.requester_account_id === account.accountId;
    if (account.role === 'contributor') return row.contributor_account_id === account.accountId;
    return false;
  }

  async function healthValue(client) {
    const column = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'earned_work_obligations' AND column_name = 'capture_evidence'`,
      [profile.earnedSchema],
    );
    return {
      ready: true,
      serverClass: 'live',
      mode: profile.label === 'STAGING' ? 'staging' : 'private',
      deploymentLabel: profile.label,
      wireVersion: WIRE_VERSION,
      storageProfile: 'verify-full-postgres',
      publicEnabled: false,
      authoritativeLedger: true,
      kernelDouble: false,
      production: false,
      paymentsActivation: false,
      publicChain: profile.publicChain,
      observedBlock: observation.blockNumber,
      remoteRead: observation.remoteRead,
      remoteDecimals: observation.remoteDecimals,
      fundedTasks: 'off',
      humanAssets: 'off',
      tenant: profile.tenant,
      chain: profile.chain,
      migration005Applied: column.rows.length > 0,
      schema: 'pilot.root71.hosted-wallet-market.v1',
      mounted: true,
      ...(machine?{machineCapability:machine.descriptor}:{}),
    };
  }

  async function signup(req, res, body) {
    keysOf(body, ['password', 'displayName', 'role']);
    must(typeof body.password === 'string' && body.password.length >= 16 && body.password.length <= 200, 'password_refused');
    must(typeof body.displayName === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,40}$/.test(body.displayName), 'display_name_refused');
    if (body.role === 'authority') throw httpError(403, 'authority_refused');
    must(['requester', 'contributor'].includes(body.role), 'role_required');
    const proof = req.headers['x-account-operation-proof'];
    must(typeof proof === 'string' && /^[A-Za-z0-9_-]{43}$/.test(proof), 'proof_required');
    if (machine) {
      must(req.headers.origin === originBox.origin, 'origin_required',401);
      const produced=await withTx(client=>mutate(client,req,body,null,tx=>machine.issueSession('signup',req,body,tx)));
      return finish(res,produced);
    }
    const produced = await withTx(client => mutate(client, req, body, null, async tx => {
      const accountId = id('acc_');
      const profileId = id('prf_');
      const sessionId = id('ses_');
      const recoveryCode = randomBytes(24).toString('base64url');
      const csrf = randomBytes(32).toString('hex');
      const pair = `__Host-neo_contributor=acs_${randomBytes(32).toString('base64url')}`;
      const proofHash = sha256(proof);
      const stamp = nowDate();
      const expires = new Date(stamp.getTime() + 86400000);
      await tx.query(
        `INSERT INTO journey_accounts
          (id, public_profile_id, display_name, password_record, recovery_hash, auth_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, $6, $6)`,
        [accountId, profileId, body.displayName, passwordRecord(body.password), sha256(recoveryCode), stamp],
      );
      await tx.query(
        `INSERT INTO journey_account_sessions
          (id, account_id, token_hash, auth_version, auth_time, expires_at)
         VALUES ($1, $2, $3, 1, $4, $5)`,
        [sessionId, accountId, sha256(pair), stamp, expires],
      );
      await tx.query('INSERT INTO hosted_wallet_market.roles (account_id, role) VALUES ($1, $2)', [accountId, body.role]);
      await tx.query('INSERT INTO hosted_wallet_market.proofs (proof_hash, account_id) VALUES ($1, $2)', [proofHash, accountId]);
      await tx.query('INSERT INTO hosted_wallet_market.session_delivery (account_id, cookie_hash, csrf) VALUES ($1, $2, $3)', [accountId, sha256(pair), csrf]);
      await tx.query(
        `INSERT INTO journey_account_operations
          (operation, scope, idempotency_key, proof_hash, request_hash, account_id, session_id, auth_version, sealed_response, created_at, expires_at)
         VALUES ('signup', 'hosted-wallet-market', $1, $2, $3, $4, $5, 1, $6, $7, $8)`,
        [req.headers['idempotency-key'], proofHash, digest(body), accountId, sessionId, JSON.stringify({accountId, sessionId}), stamp, expires],
      );
      return {
        accountId,
        proofHash,
        cookie: pair,
        csrf,
        value: {sessionDelivery: 'cookie', account: {accountId, role: body.role}, recoveryCode},
      };
    }));
    finish(res, produced);
  }

  async function signupReadback(req, res, body) {
    keysOf(body, ['operation']);
    must(body.operation === 'signup' || (machine && ['login','recover'].includes(body.operation)), 'operation_refused');
    const key = req.headers['idempotency-key'];
    const proof = req.headers['x-account-operation-proof'];
    must(typeof key === 'string' && typeof proof === 'string', 'not_found', 404);
    const found = await withClient(async client => {
      const rows = await client.query(
        `SELECT response_json, principal_id FROM earned_work_idempotency
         WHERE scope = 'hosted-wallet-market' AND task_id = '' AND key = $1`,
        [key],
      );
      const row = rows.rows[0];
      if (!row || !row.principal_id) return null;
      const wrapper = asObject(row.response_json);
      if (wrapper.proofHash !== sha256(proof)) return null;
      if (!wrapper.sealed) return {expired: true};
      const opened = openSecrets(replayKey, wrapper.sealed, nowMs());
      if (!opened) {
        await forgetExpired(client);
        return {expired: true};
      }
      const delivery = await client.query(
        'SELECT cookie_hash, csrf FROM hosted_wallet_market.session_delivery WHERE account_id = $1',
        [row.principal_id],
      );
      if (!delivery.rows[0] || delivery.rows[0].cookie_hash !== sha256(opened.cookie) || delivery.rows[0].csrf !== wrapper.csrf) return null;
      return {
        value: {...wrapper.value, recoveryCode: opened.recoveryCode},
        cookie: opened.cookie,
        csrf: wrapper.csrf,
      };
    });
    if (found?.expired) throw httpError(409, 'recovery_expired');
    if (!found) throw httpError(404, 'not_found');
    send(res, 200, {ok: true, value: found.value}, cookieHeaders(found.cookie, found.csrf));
  }

  async function session(req, res) {
    const account = await withClient(client => accountFrom(client, req));
    const wallet = await withClient(client => client.query(
      'SELECT revocation_epoch FROM hosted_wallet_market.wallets WHERE account_id = $1',
      [account.accountId],
    ));
    send(res, 200, {ok: true, value: {
      account: {accountId: account.accountId, role: account.role},
      walletEpoch: wallet.rows[0] ? wallet.rows[0].revocation_epoch : null,
    }}, {'x-cj-csrf': account.csrf});
  }

  async function postTask(req, res, body) {
    keysOf(body, ['title', 'publicText', 'grossAtomic', 'railCostAtomic', 'feeRecipient', 'captures']);
    must(typeof body.title === 'string' && body.title.length > 0 && body.title.length <= 120, 'title_refused');
    must(typeof body.publicText === 'string' && body.publicText.length > 0 && body.publicText.length <= 500, 'public_text_refused');
    must(/^0x[a-f0-9]{40}$/.test(body.feeRecipient || ''), 'fee_recipient_refused');
    if (body.feeRecipient !== profile.feeRecipient) throw httpError(409, 'fee_recipient_refused');
    const marker = frozenMarker(body.title) || frozenMarker(body.publicText);
    if (marker) throw httpError(409, 'legacy_unchanged');
    must(Array.isArray(body.captures) && body.captures.every(part => typeof part === 'string'), 'capture_refused');
    let economics;
    try { economics = quoteEconomics({gross: body.grossAtomic, railCost: body.railCostAtomic, captures: body.captures}); }
    catch (error) {
      const code = error.codeName || error.code || error.message;
      throw httpError(400, /^[a-z0-9_]+$/.test(code || '') ? code : 'quote_refused');
    }
    if (economics.roundingProfile !== ROUNDING_PROFILE) throw httpError(400, 'rounding_profile_refused');
    const leak = {
      amounts: [economics.grossAtomic, economics.platformFeeAtomic, economics.contributorNetAtomic],
      feeRecipient: profile.feeRecipient,
    };
    if (publicFieldLeaks(body.title, leak) || publicFieldLeaks(body.publicText, leak)) throw httpError(400, 'amount_in_public_text');
    const termsVersion = `sha256:${digest({...economics, feeRecipient: profile.feeRecipient})}`;
    const taskId = id('task_');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      if (account.role !== 'requester') throw httpError(403, 'requester_required');
      return mutate(client, req, body, account, async tx => {
        const stamp = nowDate();
        const expiry = new Date(stamp.getTime() + quoteTtlMs);
        await tx.query(
          `INSERT INTO earned_work_tasks (
            id, title, summary, provenance, lifecycle, funding_state, payout_state,
            current_terms_version, terms_revision, schema_version, correction_max_revisions,
            budget_amount, budget_asset, budget_network, created_at, updated_at
          ) VALUES (
            $1, $2, $3, 'test', 'open', 'unfunded', 'none', $4, 1, 1, 1, $5, 'USDC', $7, $6, $6
          )`,
          [taskId, body.title, body.publicText, termsVersion, economics.grossAtomic, stamp, profile.chain],
        );
        await tx.query(
          `INSERT INTO earned_work_terms (
            task_id, version, terms_revision, schema_version, summary, reward_amount, reward_asset,
            reward_network, claim_ttl_seconds, max_artifact_bytes, allowed_media_types, slot_limit, created_at
          ) VALUES ($1, $2, 1, 1, $3, $4, 'USDC', $7, $5, 16384, ARRAY['application/json']::text[], 1, $6)`,
          [taskId, termsVersion, body.publicText, economics.contributorNetAtomic, claimTtlSeconds, stamp, profile.chain],
        );
        await tx.query(
          `INSERT INTO hosted_wallet_market.quotes (
            task_id, requester_account_id, fee_recipient, economics, terms_version,
            authorization_expiry, refund_expiry, funding_wire, funded, observations, created_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6, 'unfunded', false, '[]'::jsonb, $7)`,
          [taskId, account.accountId, profile.feeRecipient, JSON.stringify(economics), termsVersion, expiry, stamp],
        );
        await event(tx, taskId, 'discovery', {termsVersion});
        await event(tx, taskId, 'terms', {termsVersion});
        const quote = await loadQuote(tx, taskId);
        return {value: quoteValue(quote)};
      });
    });
    finish(res, produced);
  }

  async function readQuote(req, res, taskId) {
    await withClient(client => accountFrom(client, req));
    const quote = await withClient(client => loadQuote(client, taskId));
    if (!quote) throw httpError(404, 'not_found');
    send(res, 200, {ok: true, value: quoteValue(quote)});
  }

  async function fundTask(req, res, taskId, body) {
    const allowed = body.proofId === undefined ? ['evidenceKind'] : ['evidenceKind', 'proofId'];
    keysOf(body, allowed);
    const kinds = {
      eip3009_authorization: ['signature_prepared', false],
      balance_read: ['balance_observed', false],
      submitted_tx: ['submitted', false],
      verified_deposit: ['confirmed_usable', true],
    };
    const mapped = kinds[body.evidenceKind];
    must(mapped, 'evidence_refused');
    if (!mapped[1] && body.proofId) throw httpError(400, 'proof_not_funding');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const quote = await loadQuote(tx, taskId, true);
        if (!quote) throw httpError(404, 'not_found');
        if (quote.requester_account_id !== account.accountId) throw httpError(403, 'requester_required');
        if (quote.authorization_expiry.getTime() <= nowMs()) throw httpError(409, 'quote_expired');
        if (quote.funded && !mapped[1]) throw httpError(409, 'funding_already_confirmed');
        const observations = asObject(quote.observations);
        let proofId = quote.proof_id;
        let chainId = quote.chain_id;
        let blockNumber = quote.block_number;
        const observation = {evidenceKind: body.evidenceKind, state: mapped[0], funded: mapped[1]};
        if (mapped[1]) {
          if (profile.publicChain) throw httpError(409, 'funding_refused');
          if (typeof body.proofId !== 'string' || !/^0x[a-f0-9]{64}$/.test(body.proofId)) throw httpError(409, 'deposit_unverified');
          if (quote.fee_recipient !== profile.feeRecipient) throw httpError(409, 'fee_recipient_refused');
          const asset = await tx.query('SELECT budget_asset FROM earned_work_tasks WHERE id = $1', [taskId]);
          if (asset.rows[0]?.budget_asset !== 'USDC') throw httpError(409, 'deposit_unverified');
          // The requester's bound wallet is the only payer. A third party is payer_unbound.
          // A declared address is not control. The funding intent signature is the control.
          const wallet = await tx.query(
            'SELECT address FROM hosted_wallet_market.wallets WHERE account_id = $1',
            [account.accountId],
          );
          const payer = wallet.rows[0]?.address;
          if (typeof payer !== 'string' || !/^0x[a-f0-9]{40}$/.test(payer)) throw httpError(409, 'payer_unbound');
          const intent = await tx.query(
            'SELECT account_id, tenant, payer, not_before_block, authorized FROM hosted_wallet_market.funding_intents WHERE task_id = $1',
            [taskId],
          );
          const intentRow = intent.rows[0];
          if (!intentRow || intentRow.authorized !== true || intentRow.account_id !== account.accountId || intentRow.payer !== payer || intentRow.tenant !== profile.tenant) {
            throw httpError(409, 'funding_intent_required');
          }
          const economics = asObject(quote.economics);
          const chain = await verifyDeposit(options.rpcUrl, {
            expectedChain: profile.chain,
            proofId: body.proofId,
            feeRecipient: profile.feeRecipient,
            settlementToken: profile.settlementToken,
            grossAtomic: economics.grossAtomic,
            payer,
          });
          const reused = await tx.query(
            'SELECT 1 FROM hosted_wallet_market.quotes WHERE proof_id = $1 AND task_id <> $2',
            [body.proofId, taskId],
          );
          if (reused.rows.length || (quote.proof_id && quote.proof_id !== body.proofId)) throw httpError(409, 'funding_proof_reused');
          if (BigInt(chain.blockNumber) <= BigInt(intentRow.not_before_block)) throw httpError(409, 'funding_proof_predates_intent');
          if (payer === profile.feeRecipient) throw httpError(409, 'self_pay_refused');
          observation.chain = chain.chain;
          observation.blockNumber = chain.blockNumber;
          observation.logIndex = chain.logIndex;
          observation.asset = chain.asset;
          chainId = chain.chain;
          blockNumber = chain.blockNumber;
          proofId = body.proofId;
          await tx.query(
            `UPDATE earned_work_tasks SET funding_state = 'reserved', updated_at = $2 WHERE id = $1`,
            [taskId, nowDate()],
          );
        }
        observations.push(observation);
        await tx.query(
          `UPDATE hosted_wallet_market.quotes
           SET funding_wire = $2, funded = $3, observations = $4::jsonb, proof_id = $5, chain_id = $6, block_number = $7
           WHERE task_id = $1`,
          [taskId, mapped[0], mapped[1], JSON.stringify(observations), proofId, chainId, blockNumber],
        );
        if (mapped[1]) await event(tx, taskId, 'funding_reserve', {chain: chainId, blockNumber});
        return {
          value: {
            taskId,
            evidenceKind: body.evidenceKind,
            fundingState: mapped[0],
            funded: mapped[1],
            reserved: false,
            proofId: mapped[1] ? proofId : null,
            observations,
          },
        };
      });
    });
    finish(res, produced);
  }

  async function terms(req, res, url) {
    const taskId = url.searchParams.get('taskId') || '';
    await withClient(client => accountFrom(client, req));
    const quote = await withClient(client => loadQuote(client, taskId));
    if (!quote) throw httpError(404, 'not_found');
    const value = quoteValue(quote);
    send(res, 200, {ok: true, value: {
      termsVersion: value.termsVersion,
      termsId: value.termsVersion,
      task: {rewardAtomic: value.contributorNetAtomic, submissionDeadline: value.authorizationExpiry},
      quote: value,
    }});
  }

  async function bindClaim(req, res, body) {
    keysOf(body, ['roundKey']);
    must(TASK_ID.test(body.roundKey || ''), 'not_found', 404);
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const quote = await loadQuote(tx, body.roundKey);
        if (!quote) throw httpError(404, 'not_found');
        if (quote.requester_account_id === account.accountId) throw httpError(403, 'self_claim_refused');
        if (account.role !== 'contributor') throw httpError(403, 'contributor_required');
        await tx.query(
          `INSERT INTO hosted_wallet_market.bindings (task_id, account_id, created_at)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [body.roundKey, account.accountId, nowDate()],
        );
        return {value: {roundKey: body.roundKey, bound: true}};
      });
    });
    finish(res, produced);
  }

  async function claim(req, res, body) {
    keysOf(body, ['taskId', 'termsVersion', 'acceptTerms', 'payoutDestination']);
    must(body.acceptTerms === true, 'terms_not_accepted');
    must(TASK_ID.test(body.taskId || ''), 'not_found', 404);
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const quote = await loadQuote(tx, body.taskId, true);
        if (!quote) throw httpError(404, 'not_found');
        if (quote.requester_account_id === account.accountId) throw httpError(403, 'self_claim_refused');
        if (account.role !== 'contributor') throw httpError(403, 'contributor_required');
        if (quote.terms_version !== body.termsVersion) throw httpError(409, 'terms_changed');
        if (!quote.funded) throw httpError(409, 'funding_not_usable');
        if (quote.authorization_expiry.getTime() <= nowMs()) throw httpError(409, 'quote_expired');
        const bound = await tx.query(
          'SELECT 1 FROM hosted_wallet_market.bindings WHERE task_id = $1 AND account_id = $2',
          [body.taskId, account.accountId],
        );
        if (!bound.rows[0]) throw httpError(409, 'binding_required');
        const occupying = await tx.query(
          `SELECT id FROM earned_work_reservations WHERE task_id = $1 AND status IN ('active', 'submitted')`,
          [body.taskId],
        );
        if (occupying.rows[0]) throw httpError(409, 'slot_taken');
        const destination = body.payoutDestination || addressOf(account.accountId);
        must(/^0x[a-f0-9]{40}$/.test(destination), 'destination_refused');
        const reservationId = id('rsv_');
        const tokenId = id('tok_');
        const publicId = id('pub_');
        const tokenHash = sha256(`${tokenId}:${account.accountId}`);
        const stamp = nowDate();
        const expires = new Date(stamp.getTime() + claimTtlSeconds * 1000);
        await tx.query(
          `INSERT INTO earned_work_contributor_tokens
            (id, public_id, token_hash, payout_destination, task_scope, provenance, created_at)
           VALUES ($1, $2, $3, $4, $5, 'test', $6)`,
          [tokenId, publicId, tokenHash, destination, body.taskId, stamp],
        );
        await tx.query(
          `INSERT INTO hosted_wallet_market.grants (account_id, task_id, token_id, public_id, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [account.accountId, body.taskId, tokenId, publicId, stamp],
        );
        await tx.query(
          `INSERT INTO journey_account_kernel_bindings
            (account_id, kernel_scope, earned_task_id, public_id, token_hash, principal_id, source, created_at)
           VALUES ($1, $2, $2, $3, $4, $5, 'created', $6)`,
          [account.accountId, body.taskId, publicId, tokenHash, tokenId, stamp],
        );
        await tx.query(
          `INSERT INTO earned_work_reservations
            (id, task_id, terms_version, contributor_public_id, contributor_token_id, status, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)`,
          [reservationId, body.taskId, quote.terms_version, publicId, tokenId, expires, stamp],
        );
        await tx.query(
          `UPDATE earned_work_tasks SET lifecycle = 'claimed', updated_at = $2 WHERE id = $1`,
          [body.taskId, stamp],
        );
        await tx.query(
          `UPDATE hosted_wallet_market.quotes SET contributor_account_id = $2, payout_destination = $3 WHERE task_id = $1`,
          [body.taskId, account.accountId, destination],
        );
        await event(tx, body.taskId, 'claim', {reservationId});
        return {value: {kind: 'claimed', claim: {reservationId, taskId: body.taskId, canStart: true, payoutDestination: destination, walletRequired: false}}};
      });
    });
    finish(res, produced);
  }

  function parseEvidence(evidence) {
    must(evidence?.format === 'json' && typeof evidence.body === 'string', 'evidence_refused');
    const bytes = Buffer.from(evidence.body);
    must(bytes.length >= 1 && bytes.length <= 16384, 'evidence_refused');
    let report;
    try { report = JSON.parse(evidence.body); }
    catch { throw httpError(400, 'evidence_refused'); }
    if (report.signedNextConsumerReceipt) throw httpError(400, 'next_consumer_receipt_not_issued');
    try { continuityEvidence(report); }
    catch (error) { throw httpError(400, error.codeName || error.message || 'evidence_refused'); }
    return {report, bytes, evidenceHash: digest(report), rawSha: sha256(bytes)};
  }

  async function draft(req, res, reservationId, body) {
    keysOf(body, ['reservationId', 'termsVersion', 'expectedRevision', 'evidence']);
    must(body.reservationId === reservationId && body.expectedRevision === 0, 'revision_refused');
    const parsed = parseEvidence(body.evidence);
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const row = await reservationView(tx, reservationId);
        if (!row || row.contributor_account_id !== account.accountId) throw httpError(404, 'not_found');
        if (row.expires_at.getTime() <= nowMs()) throw httpError(409, 'reservation_expired');
        if (row.terms_version !== body.termsVersion) throw httpError(409, 'terms_changed');
        if (row.status === 'submitted') throw httpError(409, 'already_submitted');
        if (row.status !== 'active') throw httpError(409, 'reservation_expired');
        const prior = await tx.query('SELECT evidence_hash FROM hosted_wallet_market.delivery WHERE reservation_id = $1', [reservationId]);
        if (!prior.rows[0]) {
          const submissionId = id('sub_');
          const stamp = nowDate();
          await tx.query(
            `INSERT INTO earned_work_submissions (
              id, task_id, reservation_id, terms_version, artifact_ref, artifact_digest_sha256,
              artifact_media_type, artifact_bytes, evidence_bytes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'application/json', $7, $8, $9)`,
            [submissionId, row.task_id, reservationId, row.terms_version, `hosted-wallet-market:delivery:${reservationId}`, parsed.rawSha, parsed.bytes.length, parsed.bytes, stamp],
          );
          await tx.query(
            `INSERT INTO hosted_wallet_market.delivery
              (reservation_id, task_id, evidence_hash, raw_sha256, business_status, body_bytes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [reservationId, row.task_id, parsed.evidenceHash, parsed.rawSha, parsed.report.businessStatus, parsed.bytes.length, stamp],
          );
        } else if (prior.rows[0].evidence_hash !== parsed.evidenceHash) {
          throw httpError(409, 'immutable_operation_input_changed');
        }
        return {value: {draft: {revision: 1, evidenceHash: parsed.evidenceHash}, accepted: false, usefulOutcome: null, nextConsumerReceipt: null}};
      });
    });
    finish(res, produced);
  }

  async function submitDelivery(req, res, reservationId, body) {
    keysOf(body, ['reservationId', 'expectedRevision']);
    must(body.reservationId === reservationId && body.expectedRevision === 1, 'revision_refused');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const locked = await tx.query(
          `SELECT r.status, r.expires_at, r.task_id, g.account_id
           FROM earned_work_reservations r
           JOIN hosted_wallet_market.grants g ON g.token_id = r.contributor_token_id
           WHERE r.id = $1 FOR UPDATE`,
          [reservationId],
        );
        const row = locked.rows[0];
        if (!row || row.account_id !== account.accountId) throw httpError(404, 'not_found');
        if (row.expires_at.getTime() <= nowMs()) throw httpError(409, 'reservation_expired');
        const delivery = await tx.query('SELECT business_status FROM hosted_wallet_market.delivery WHERE reservation_id = $1', [reservationId]);
        if (!delivery.rows[0]) throw httpError(409, 'draft_required');
        if (row.status === 'submitted') throw httpError(409, 'already_submitted');
        if (row.status !== 'active') throw httpError(409, 'reservation_expired');
        const stamp = nowDate();
        await tx.query(`UPDATE earned_work_reservations SET status = 'submitted' WHERE id = $1`, [reservationId]);
        await tx.query(`UPDATE earned_work_tasks SET lifecycle = 'submitted', updated_at = $2 WHERE id = $1`, [row.task_id, stamp]);
        await event(tx, row.task_id, 'submit', {reservationId});
        return {value: {
          deliveryState: 'submitted',
          authoritative: false,
          accepted: false,
          usefulOutcome: null,
          httpStatusIsAcceptance: false,
          nextConsumerReceipt: null,
          businessStatus: delivery.rows[0].business_status,
        }};
      });
    });
    finish(res, produced);
  }

  async function reviewRead(req, res, url) {
    const taskId = url.searchParams.get('taskId') || '';
    const reservationId = url.searchParams.get('reservationId') || '';
    if (taskId && reservationId) {
      const value = await withClient(client => readEntitledOutcome(client, req, {
        taskId,
        reservationId,
        readAcceptedSource: options.readAcceptedSource,
        nowMs,
        registryRoot: dischargeRegistry,
        rpcUrl: options.rpcUrl,
        assertBound: bound => debtConsumer.assertBinding(bound),
      }));
      return send(res, 200, {ok: true, value});
    }
    const account = await withClient(client => accountFrom(client, req));
    const row = await withClient(client => reservationView(client, reservationId));
    if (!visible(account, row)) throw httpError(404, 'not_found');
    const review = await withClient(client => client.query(
      'SELECT state, obligation_id FROM hosted_wallet_market.reviews WHERE reservation_id = $1',
      [reservationId],
    ));
    const delivery = row.evidence_hash ? row : null;
    const state = review.rows[0]?.state || (row.status === 'submitted' ? 'submitted' : 'claimed');
    send(res, 200, {ok: true, value: {
      viewer: account.role,
      state,
      source: sourceOf(delivery, row),
      debtCreated: Boolean(review.rows[0]?.obligation_id),
      fulfillment: {paid: false},
    }});
  }

  async function verdict(req, res, body) {
    keysOf(body, ['source', 'outcome']);
    must(body.outcome === 'pass', 'outcome_refused');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const row = await reservationView(tx, body.source?.reservationId || '');
        if (!row || account.role !== 'requester' || row.requester_account_id !== account.accountId) throw httpError(403, 'requester_required');
        if (row.status !== 'submitted' || !row.evidence_hash) throw httpError(409, 'submission_required');
        if (digest(body.source) !== digest(sourceOf(row, row))) throw httpError(409, 'source_changed');
        const prior = await tx.query('SELECT verdict_id, state, obligation_id FROM hosted_wallet_market.reviews WHERE reservation_id = $1 FOR UPDATE', [row.id]);
        if (!prior.rows[0]) {
          const submission = await tx.query('SELECT id, artifact_digest_sha256 FROM earned_work_submissions WHERE reservation_id = $1', [row.id]);
          const verdictId = id('ver_');
          const stamp = nowDate();
          await tx.query(
            `INSERT INTO earned_work_verdicts (
              id, task_id, reservation_id, submission_id, terms_version, artifact_digest_sha256,
              verifier_version, outcome, reasons, ordinal, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'hosted-wallet-market', 'pass', $7::jsonb, 1, $8)`,
            [verdictId, row.task_id, row.id, submission.rows[0].id, row.terms_version, submission.rows[0].artifact_digest_sha256, JSON.stringify({outcome: 'pass'}), stamp],
          );
          await tx.query(
            `INSERT INTO hosted_wallet_market.reviews
              (reservation_id, task_id, state, verdict_id, source_hash, created_at)
             VALUES ($1, $2, 'verdict', $3, $4, $5)`,
            [row.id, row.task_id, verdictId, digest(body.source), stamp],
          );
          await tx.query(`UPDATE earned_work_tasks SET lifecycle = 'verified', updated_at = $2 WHERE id = $1`, [row.task_id, stamp]);
          await event(tx, row.task_id, 'verdict', {verdictId});
        }
        const current = await tx.query('SELECT verdict_id, state, obligation_id FROM hosted_wallet_market.reviews WHERE reservation_id = $1', [row.id]);
        return {value: {view: {verdict: {outcome: 'pass', id: current.rows[0].verdict_id}, state: current.rows[0].state, debtCreated: Boolean(current.rows[0].obligation_id)}}};
      });
    });
    finish(res, produced);
  }

  async function decision(req, res, body) {
    keysOf(body, ['source', 'decision', 'verdictId']);
    must(body.decision === 'accept', 'decision_refused');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const row = await reservationView(tx, body.source?.reservationId || '');
        if (!row || account.role !== 'requester' || row.requester_account_id !== account.accountId) throw httpError(403, 'requester_required');
        if (digest(body.source) !== digest(sourceOf(row, row))) throw httpError(409, 'source_changed');
        const review = await tx.query('SELECT * FROM hosted_wallet_market.reviews WHERE reservation_id = $1 FOR UPDATE', [row.id]);
        if (!review.rows[0] || review.rows[0].verdict_id !== body.verdictId) throw httpError(409, 'verdict_required');
        if (review.rows[0].state === 'accepted') throw httpError(409, 'premature_acceptance');
        if (review.rows[0].state === 'verdict') {
          await tx.query(`UPDATE hosted_wallet_market.reviews SET state = 'approval_pending' WHERE reservation_id = $1`, [row.id]);
        }
        const current = await tx.query('SELECT state, verdict_id FROM hosted_wallet_market.reviews WHERE reservation_id = $1', [row.id]);
        if (current.rows[0].state === 'accepted') throw httpError(409, 'premature_acceptance');
        return {value: {view: {state: current.rows[0].state, debtCreated: false, fulfillment: {paid: false}, handoff: {verdictId: current.rows[0].verdict_id}}}};
      });
    });
    finish(res, produced);
  }

  async function nativePaid(tx, obligationId) {
    if (!obligationId) return false;
    const found = await tx.query(
      'SELECT kernel_paid FROM hosted_wallet_market.native_debt_dispositions WHERE obligation_id = $1',
      [obligationId],
    );
    return found.rows[0]?.kernel_paid === true;
  }

  function authorityView(review, quote, delivery, bound = false) {
    const earlyRefund = review.winner === 'refund' && quote.refund_expiry.getTime() > nowMs();
    let usefulOutcome = null;
    if (review.obligation_id) {
      if (bound) usefulOutcome = 'native_paid';
      else usefulOutcome = ['failed', 'refused'].includes(delivery.business_status) ? 'no_fit_payable' : 'accepted_payable';
    }
    return {
      reservationId: review.reservation_id,
      winner: review.winner,
      state: review.state,
      debtCreated: Boolean(review.obligation_id),
      obligationId: review.obligation_id,
      incident: review.winner === 'operator_capture' || (!review.winner && Number(review.operator_incidents) > 0),
      operatorIncidents: Number(review.operator_incidents),
      feeRecipient: quote.fee_recipient,
      liquiditySource: review.winner === 'refund' ? 'operator' : null,
      contributorFundsPulled: false,
      refundBeforeSharedExpiry: earlyRefund,
      usefulOutcome,
    };
  }

  function ownerPrincipal(req) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!ownerAuthority || !token) throw httpError(403, 'authority_required');
    try {
      ownerAuthority.verify(token);
      return ownerAuthority.hashToken(token);
    } catch {
      throw httpError(403, 'authority_required');
    }
  }

  async function importNativeDebt(req, res, body) {
    keysOf(body, IMPORT_BODY_KEYS);
    assertImportShape(body);
    const principal = ownerPrincipal(req);
    const produced = await withTx(async client => {
      await debtConsumer.assertBinding(client);
      return mutate(client, req, body, {accountId: principal}, async tx => {
        return {value: await debtConsumer.importNativeDischarge(tx, body, nowDate())};
      });
    });
    finish(res, produced);
  }

  async function enrollNativeDebt(req, res, body) {
    keysOf(body, []);
    const principal = ownerPrincipal(req);
    const produced = await withTx(async client => {
      await debtConsumer.assertEnrollmentCandidate(client);
      const result = await mutate(client, req, body, {accountId: principal}, async tx => {
        return {value: await debtConsumer.enroll(tx, nowDate())};
      });
      await debtConsumer.assertBinding(client);
      return result;
    });
    finish(res, produced);
  }

  async function readEnrollmentView(req, res) {
    ownerPrincipal(req);
    const value = await withClient(client => debtConsumer.readEnrollment(client));
    send(res, 200, {ok: true, value});
  }

  async function readNativeDebtView(req, res, url) {
    ownerPrincipal(req);
    const names = [...url.searchParams.keys()];
    if (names.some(name => name !== 'obligationId')) throw httpError(400, 'body_refused');
    const value = await withClient(client => debtConsumer.readNativeDebt(client, url.searchParams.get('obligationId') || ''));
    send(res, 200, {ok: true, value});
  }

  async function authority(req, res, body) {
    if (profile.publicChain && body?.winner === 'authorized_capture') throw httpError(409, 'public_chain_effect_refused');
    keysOf(body, ['reservationId', 'winner']);
    const winners = ['authorized_capture', 'escrow_expiry', 'reclaim', 'refund', 'operator_capture'];
    must(winners.includes(body.winner), 'winner_refused');
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!ownerAuthority || !token) throw httpError(403, 'authority_required');
    let principal;
    try {
      ownerAuthority.verify(token);
      principal = ownerAuthority.hashToken(token);
    } catch {
      throw httpError(403, 'authority_required');
    }
    const produced = await withTx(async client => {
      return mutate(client, req, body, {accountId: principal}, async tx => {
        if (body.winner === 'authorized_capture') {
          try {
            await assertObligationGuard(tx, {earnedSchema: profile.earnedSchema});
          } catch (error) {
            if (error.codeName === 'guard_unsealed' || error.codeName === 'guard_incomplete') throw httpError(409, error.codeName);
            throw error;
          }
        }
        const reservation = await tx.query(
          `SELECT id, task_id, status, terms_version, contributor_public_id, contributor_token_id
           FROM earned_work_reservations WHERE id = $1 FOR UPDATE`,
          [body.reservationId],
        );
        const held = reservation.rows[0];
        if (!held || held.status !== 'submitted') throw httpError(409, 'submission_required');
        const delivery = await tx.query('SELECT * FROM hosted_wallet_market.delivery WHERE reservation_id = $1', [body.reservationId]);
        if (!delivery.rows[0]) throw httpError(409, 'submission_required');
        let review = (await tx.query('SELECT * FROM hosted_wallet_market.reviews WHERE reservation_id = $1 FOR UPDATE', [body.reservationId])).rows[0];
        if (!review) {
          await tx.query(
            `INSERT INTO hosted_wallet_market.reviews (reservation_id, task_id, state, created_at)
             VALUES ($1, $2, 'submitted', $3)`,
            [body.reservationId, held.task_id, nowDate()],
          );
          review = (await tx.query('SELECT * FROM hosted_wallet_market.reviews WHERE reservation_id = $1 FOR UPDATE', [body.reservationId])).rows[0];
        }
        const quote = await loadQuote(tx, held.task_id, true);
        if (review.winner) {
          if (review.winner !== body.winner) throw httpError(409, 'winner_already_recorded');
          const bound = await nativePaid(tx, review.obligation_id);
          return {value: authorityView(review, quote, delivery.rows[0], bound)};
        }
        if (body.winner === 'operator_capture') {
          await tx.query(
            'UPDATE hosted_wallet_market.reviews SET operator_incidents = operator_incidents + 1 WHERE reservation_id = $1',
            [body.reservationId],
          );
          const current = (await tx.query('SELECT * FROM hosted_wallet_market.reviews WHERE reservation_id = $1', [body.reservationId])).rows[0];
          const bound = await nativePaid(tx, current.obligation_id);
          return {value: {...authorityView(current, quote, delivery.rows[0], bound), incident: true, debtCreated: false, winner: null}};
        }
        if (body.winner === 'authorized_capture') {
          if (review.state !== 'approval_pending') throw httpError(409, 'acceptance_required');
          const economics = asObject(quote.economics);
          const gross = BigInt(economics.grossAtomic);
          const rail = BigInt(economics.railCostAtomic);
          const fee = BigInt(economics.platformFeeAtomic);
          const net = BigInt(economics.contributorNetAtomic);
          if (fee !== (gross * 500n) / 10000n || net !== gross - fee - rail) throw httpError(409, 'quote_fee_mismatch');
          if (quote.chain_id !== profile.chain || !/^[0-9]+$/.test(quote.block_number || '')) throw httpError(409, 'chain_refused');
          const submission = await tx.query('SELECT id FROM earned_work_submissions WHERE reservation_id = $1', [body.reservationId]);
          const obligationId = id('obl_');
          const stamp = nowDate();
          await tx.query(
            'INSERT INTO hosted_wallet_market_guard.preserved_obligation_ids (id) VALUES ($1)',
            [obligationId],
          );
          await tx.query(
            `INSERT INTO earned_work_obligations (
              id, task_id, reservation_id, submission_id, contributor_public_id, payout_destination,
              reward_amount, reward_asset, reward_network, payout_state, terms_version,
              idempotency_key, adapter, verdict_id, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,'USDC',$12,'owed',$8,$9,$13,$10,$11)`,
            [obligationId, held.task_id, held.id, submission.rows[0].id, held.contributor_public_id, quote.payout_destination, net.toString(), held.terms_version, req.headers['idempotency-key'], review.verdict_id, stamp, profile.chain, profile.label === 'STAGING' ? 'staging-representation' : 'private-representation'],
          );
          await tx.query(
            `INSERT INTO hosted_wallet_market.captures (
              task_id, reservation_id, obligation_id, gross_atomic, rail_atomic, fee_atomic, net_atomic,
              fee_bps, chain, block_number, transfer, winner, created_at
            ) VALUES ($1,$2,$3,$4::bigint,$5::bigint,$6::bigint,$7::bigint,500,$10,$8,false,'authorized_capture',$9)`,
            [held.task_id, held.id, obligationId, gross.toString(), rail.toString(), fee.toString(), net.toString(), quote.block_number, stamp, profile.chain],
          );
          await tx.query(
            `UPDATE hosted_wallet_market.reviews
             SET winner = 'authorized_capture', state = 'accepted', obligation_id = $2
             WHERE reservation_id = $1 AND winner IS NULL`,
            [body.reservationId, obligationId],
          );
          await tx.query(
            `UPDATE earned_work_tasks SET lifecycle = 'accepted', payout_state = 'owed', updated_at = $2 WHERE id = $1`,
            [held.task_id, stamp],
          );
          await event(tx, held.task_id, 'accept', {obligationId, payoutState: 'owed'});
          const current = (await tx.query('SELECT * FROM hosted_wallet_market.reviews WHERE reservation_id = $1', [body.reservationId])).rows[0];
          if (current.winner !== 'authorized_capture' || current.obligation_id !== obligationId) throw httpError(409, 'winner_already_recorded');
          const bound = await nativePaid(tx, current.obligation_id);
          return {value: authorityView(current, quote, delivery.rows[0], bound)};
        }
        await tx.query(
          `UPDATE hosted_wallet_market.reviews SET winner = $2, state = 'closed_without_debt' WHERE reservation_id = $1 AND winner IS NULL`,
          [body.reservationId, body.winner],
        );
        const current = (await tx.query('SELECT * FROM hosted_wallet_market.reviews WHERE reservation_id = $1', [body.reservationId])).rows[0];
        if (current.winner !== body.winner) throw httpError(409, 'winner_already_recorded');
        const bound = await nativePaid(tx, current.obligation_id);
        return {value: authorityView(current, quote, delivery.rows[0], bound)};
      });
    });
    finish(res, produced);
  }

  function page(url) {
    const limit = Number(url.searchParams.get('limit') || '20');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw httpError(400, 'limit_refused');
    const raw = url.searchParams.get('cursor');
    let cursor = '';
    if (raw) {
      try { cursor = Buffer.from(raw, 'base64url').toString('utf8'); }
      catch { throw httpError(400, 'cursor_refused'); }
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw httpError(400, 'cursor_refused');
    }
    return {limit, cursor};
  }

  async function discover(res, url) {
    const {limit, cursor} = page(url);
    if (profile.publicReads === '0') return send(res,200,{ok:true,value:{items:[],nextCursor:null,publicEnabled:false}});
    const rows = await withClient(client => client.query(
      `SELECT q.task_id, t.title, t.summary AS public_text, q.funding_wire, q.terms_version
       FROM hosted_wallet_market.quotes q
       JOIN earned_work_tasks t ON t.id = q.task_id
       WHERE q.task_id ~ '^task_[A-Za-z0-9_-]{16}$' AND q.task_id > $1
       ORDER BY q.task_id ASC
       LIMIT $2`,
      [cursor, limit],
    ));
    const items = rows.rows.map(row => ({
      taskId: row.task_id,
      title: row.title,
      publicText: row.public_text,
      slotLimit: 1,
      fundingState: row.funding_wire,
      termsVersion: row.terms_version,
    }));
    const nextCursor = rows.rows.length === limit ? Buffer.from(rows.rows.at(-1).task_id).toString('base64url') : null;
    send(res, 200, {ok: true, value: {items, nextCursor}});
  }

  async function payouts(req, res, url) {
    const {limit, cursor} = page(url);
    const account = await withClient(client => accountFrom(client, req));
    const rows = await withClient(client => client.query(
      `SELECT o.id, o.task_id, o.reservation_id, o.reward_amount, o.payout_destination, o.terms_version, o.payout_state,
              c.gross_atomic, c.rail_atomic, g.account_id
       FROM earned_work_obligations o
       JOIN hosted_wallet_market.captures c ON c.obligation_id = o.id
       JOIN hosted_wallet_market.grants g ON g.task_id = o.task_id
       WHERE g.account_id = $1 AND o.id > $2
         AND NOT EXISTS (
           SELECT 1 FROM hosted_wallet_market.native_debt_dispositions d
           WHERE d.obligation_id = o.id AND d.kernel_paid IS TRUE
         )
       ORDER BY o.id ASC
       LIMIT $3`,
      [account.accountId, cursor, limit],
    ));
    const wallet = await withClient(client => client.query(
      'SELECT account_id FROM hosted_wallet_market.wallets WHERE account_id = $1',
      [account.accountId],
    ));
    const items = rows.rows.map(row => ({
      obligationId: row.id,
      accountId: row.account_id,
      reservationId: row.reservation_id,
      taskId: row.task_id,
      amountAtomic: row.reward_amount,
      destination: row.payout_destination,
      termsVersion: row.terms_version,
      payoutState: row.payout_state,
      walletRequired: false,
      legacy: false,
      externalDischargeHold: ['external_discharge_pending','payment_outcome_pending'].includes(pendingRegistryDisposition(dischargeRegistry,row.id)),
      measurements: {
        feeBaseAtomic: String(row.gross_atomic),
        confirmedFundingAtomic: String(row.gross_atomic),
        serviceCostAtomic: String(row.rail_atomic),
        usefulOutcome: 'accepted_payable',
        repeatPurchaseCount: 0,
      },
    }));
    const nextCursor = rows.rows.length === limit ? Buffer.from(rows.rows.at(-1).id).toString('base64url') : null;
    const value = {items, nextCursor, walletEnrolled: Boolean(wallet.rows[0])};
    // A public-chain profile has no payout movement. Private responses stay unchanged.
    if (profile.publicChain) value.transfer = false;
    send(res, 200, {ok: true, value});
  }

  async function readback(req, res, url) {
    const key = url.searchParams.get('idempotencyKey') || '';
    const account = await withClient(client => accountFrom(client, req));
    const rows = await withClient(client => client.query(
      `SELECT response_json, principal_id FROM earned_work_idempotency
       WHERE scope = 'hosted-wallet-market' AND task_id = '' AND key = $1`,
      [key],
    ));
    if (!rows.rows[0]) return send(res, 200, {ok: true, value: {state: 'absent'}});
    if (!rows.rows[0].principal_id || rows.rows[0].principal_id !== account.accountId) throw httpError(404, 'not_found');
    send(res, 200, {ok: true, value: {state: 'recorded', response: asObject(rows.rows[0].response_json).value}});
  }

  async function boundPayer(tx, accountId) {
    const wallet = await tx.query(
      'SELECT address FROM hosted_wallet_market.wallets WHERE account_id = $1',
      [accountId],
    );
    const payer = wallet.rows[0]?.address;
    if (typeof payer !== 'string' || !/^0x[a-f0-9]{40}$/.test(payer)) throw httpError(409, 'payer_unbound');
    const code = await readAccountCode(options.rpcUrl, payer);
    if (code !== '0x' && code !== '0x0') throw httpError(409, 'contract_wallet_unsupported');
    return payer;
  }

  function intentMessage(accountId, taskId, payer, grossAtomic, notBeforeBlock) {
    return fundingIntentMessage({
      tenant: profile.tenant,
      chain: profile.chain,
      accountId,
      taskId,
      payer,
      recipient: profile.feeRecipient,
      token: profile.settlementToken,
      grossAtomic,
      notBeforeBlock: String(notBeforeBlock),
    });
  }

  async function issueFundingIntent(req, res, taskId, body) {
    keysOf(body, []);
    if (profile.publicChain) throw httpError(409, 'funding_refused');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      if (account.role !== 'requester') throw httpError(403, 'requester_required');
      return mutate(client, req, body, account, async tx => {
        const quote = await loadQuote(tx, taskId, true);
        if (!quote) throw httpError(404, 'not_found');
        if (quote.requester_account_id !== account.accountId) throw httpError(403, 'requester_required');
        if (quote.funded) throw httpError(409, 'funding_already_confirmed');
        const payer = await boundPayer(tx, account.accountId);
        const existing = await tx.query(
          'SELECT authorized FROM hosted_wallet_market.funding_intents WHERE task_id = $1 FOR UPDATE',
          [taskId],
        );
        if (existing.rows[0]?.authorized === true) throw httpError(409, 'funding_intent_locked');
        const head = await readConfiguredChain(options.rpcUrl, profile.chain);
        const economics = asObject(quote.economics);
        const message = intentMessage(account.accountId, taskId, payer, economics.grossAtomic, head.blockNumber);
        if (existing.rows[0]) {
          await tx.query(
            `UPDATE hosted_wallet_market.funding_intents
             SET account_id = $2, tenant = $3, payer = $4, not_before_block = $5, message = $6, authorized = false, created_at = $7
             WHERE task_id = $1`,
            [taskId, account.accountId, profile.tenant, payer, head.blockNumber, message, nowDate()],
          );
        } else {
          await tx.query(
            `INSERT INTO hosted_wallet_market.funding_intents
              (task_id, account_id, tenant, payer, not_before_block, message, authorized, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
            [taskId, account.accountId, profile.tenant, payer, head.blockNumber, message, nowDate()],
          );
        }
        return {value: {taskId, payer, message, notBeforeBlock: head.blockNumber, authorized: false}};
      });
    });
    finish(res, produced);
  }

  async function confirmFundingIntent(req, res, taskId, body) {
    keysOf(body, ['signature']);
    if (profile.publicChain) throw httpError(409, 'funding_refused');
    if (typeof body.signature !== 'string' || !/^0x[0-9a-f]{130}$/.test(body.signature)) throw httpError(409, 'funding_intent_refused');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const quote = await loadQuote(tx, taskId, true);
        if (!quote) throw httpError(404, 'not_found');
        if (quote.requester_account_id !== account.accountId) throw httpError(403, 'requester_required');
        const row = await tx.query(
          'SELECT account_id, payer, message, not_before_block, authorized FROM hosted_wallet_market.funding_intents WHERE task_id = $1 FOR UPDATE',
          [taskId],
        );
        if (!row.rows[0] || row.rows[0].account_id !== account.accountId) throw httpError(409, 'funding_intent_required');
        const payer = await boundPayer(tx, account.accountId);
        if (payer !== row.rows[0].payer) throw httpError(409, 'funding_intent_refused');
        const signer = recoverPersonalSigner(row.rows[0].message, body.signature);
        if (signer !== payer) throw httpError(409, 'funding_intent_refused');
        if (row.rows[0].authorized !== true) {
          await tx.query('UPDATE hosted_wallet_market.funding_intents SET authorized = true WHERE task_id = $1', [taskId]);
        }
        return {value: {taskId, payer: row.rows[0].payer, authorized: true, notBeforeBlock: String(row.rows[0].not_before_block)}};
      });
    });
    finish(res, produced);
  }

  async function bindWallet(req, res, body) {
    keysOf(body, ['address']);
    must(/^0x[a-f0-9]{40}$/.test(body.address || ''), 'address_refused');
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const prior = await tx.query('SELECT address, revocation_epoch FROM hosted_wallet_market.wallets WHERE account_id = $1 FOR UPDATE', [account.accountId]);
        if (prior.rows[0] && prior.rows[0].address !== body.address) throw httpError(409, 'wallet_already_bound');
        if (!prior.rows[0]) {
          await tx.query(
            'INSERT INTO hosted_wallet_market.wallets (account_id, address, revocation_epoch, exported) VALUES ($1, $2, 0, false)',
            [account.accountId, body.address],
          );
        }
        return {value: {fixture: false, custody: 'declared_address', address: body.address, revocationEpoch: prior.rows[0] ? prior.rows[0].revocation_epoch : 0, bound: true, secretIncluded: false}};
      });
    });
    finish(res, produced);
  }

  async function exportWallet(req, res) {
    const account = await withClient(client => accountFrom(client, req));
    await withClient(client => client.query('UPDATE hosted_wallet_market.wallets SET exported = true WHERE account_id = $1', [account.accountId]));
    const again = await withClient(client => client.query('SELECT address, revocation_epoch FROM hosted_wallet_market.wallets WHERE account_id = $1', [account.accountId]));
    if (!again.rows[0]) throw httpError(404, 'wallet_required_for_export');
    send(res, 200, {ok: true, value: {
      fixture: false,
      custody: 'declared_address',
      address: again.rows[0].address,
      revocationEpoch: again.rows[0].revocation_epoch,
      exported: true,
      providerCopyRetained: false,
      secretIncluded: false,
    }});
  }

  async function exitWallet(req, res, body) {
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        const prior = await tx.query('SELECT revocation_epoch FROM hosted_wallet_market.wallets WHERE account_id = $1 FOR UPDATE', [account.accountId]);
        if (!prior.rows[0]) throw httpError(404, 'wallet_required_for_export');
        const epoch = Number(prior.rows[0].revocation_epoch) + 1;
        await tx.query('UPDATE hosted_wallet_market.wallets SET revocation_epoch = $2 WHERE account_id = $1', [account.accountId, epoch]);
        return {value: {revocationEpoch: epoch, sessionContinues: true, obligationsRewritten: false}};
      });
    });
    finish(res, produced);
  }

  async function exitAccount(req, res, body) {
    const produced = await withTx(async client => {
      const account = await accountFrom(client, req, {write: true});
      return mutate(client, req, body, account, async tx => {
        await tx.query('UPDATE journey_account_sessions SET revoked_at = $2 WHERE account_id = $1 AND revoked_at IS NULL', [account.accountId, nowDate()]);
        return {value: {revoked: true, sessionContinues: false}};
      });
    });
    finish(res, produced);
  }

  function miss(res, next) {
    if (typeof next === 'function') return next();
    return send(res, 404, {ok: false, code: 'not_found'});
  }

  async function handler(req, res, next) {
    req.on('error', () => {});
    res.on('error', () => {});
    const url = new URL(req.originalUrl || req.url, 'https://127.0.0.1');
    try {
      if (!url.pathname.startsWith(PREFIX)) return miss(res, next);
      const path = url.pathname.slice(PREFIX.length);
      if (await protectNativeMarket(path,res,{withClient,earnedSchema:profile.earnedSchema})) return miss(res,next);
      if (req.headers[WIRE_HEADER] && req.headers[WIRE_HEADER] !== WIRE_VERSION && path !== '/healthz') {
        return send(res, 409, {ok: false, code: 'wire_version_unsupported'});
      }
      if (path === '/healthz' && req.method === 'GET') {
        const value = await withClient(healthValue);
        return send(res, 200, {ok: true, value});
      }
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readJson(req);
      if (machine && req.method === 'POST' && ['/v1/account/login','/v1/account/recover'].includes(path)) {
        must(req.headers.origin === originBox.origin, 'origin_required',401);
        const proof=req.headers['x-account-operation-proof'];
        must(typeof proof==='string'&&/^[A-Za-z0-9_-]{43}$/.test(proof),'proof_required');
        const operation=path.split('/').at(-1);
        const produced=await withTx(client=>mutate(client,req,body,null,tx=>machine.issueSession(operation,req,body,tx)));
        return finish(res,produced);
      }
      if (path === '/v1/market/profile' && req.method === 'GET' && machine) {
        return send(res,200,{ok:true,value:machine.publicProfile()});
      }
      if (path === '/v1/market/discover' && req.method === 'GET' && machine) {
        return send(res, 200, {ok: true, value: await machine.discover(page(url))});
      }
      const machineAction = path.match(/^\/v1\/market\/([A-Za-z]+)$/);
      if (machineAction && req.method === 'POST' && machine) {
        try {
          const result = await machine.invoke(req, machineAction[1], body, req.headers['idempotency-key']);
          return send(res, 200, {ok: true, value: {action: machineAction[1], result}});
        } catch (error) {
          if (error?.name === 'Error' && error?.constructor?.name === 'BoundaryError' && /^[a-zA-Z0-9_]+$/.test(error.code)) {
            throw httpError(error.code==='operation_absent'?404:['forbidden', 'unauthorized'].includes(error.code) ? 403 : 409, error.code);
          }
          throw error;
        }
      }
      if (path === '/v1/discover' && req.method === 'GET') return await discover(res, url);
      if (path === '/v1/account/signup' && req.method === 'POST') return await signup(req, res, body);
      if (path === '/v1/account/readback' && req.method === 'POST') return await signupReadback(req, res, body);
      if (path === '/v1/account/session' && req.method === 'GET') return await session(req, res);
      if (path === '/v1/account/exit' && req.method === 'POST') return await exitAccount(req, res, body);
      if (path === '/v1/wallet/bind' && req.method === 'POST') return await bindWallet(req, res, body);
      if (path === '/v1/wallet/export' && req.method === 'GET') return await exportWallet(req, res);
      if (path === '/v1/wallet/exit' && req.method === 'POST') return await exitWallet(req, res, body);
      if (path === '/v1/tasks' && req.method === 'POST') return await postTask(req, res, body);
      const quotePath = path.match(/^\/v1\/tasks\/(task_[A-Za-z0-9_-]{16})\/quote$/);
      if (quotePath && req.method === 'GET') return await readQuote(req, res, quotePath[1]);
      const intentPath = path.match(/^\/v1\/tasks\/(task_[A-Za-z0-9_-]{16})\/funding-intent$/);
      if (intentPath && req.method === 'POST') return await issueFundingIntent(req, res, intentPath[1], body);
      const intentSignPath = path.match(/^\/v1\/tasks\/(task_[A-Za-z0-9_-]{16})\/funding-intent\/signature$/);
      if (intentSignPath && req.method === 'POST') return await confirmFundingIntent(req, res, intentSignPath[1], body);
      const fundPath = path.match(/^\/v1\/tasks\/(task_[A-Za-z0-9_-]{16})\/funding$/);
      if (fundPath && req.method === 'POST') return await fundTask(req, res, fundPath[1], body);
      if (path === '/v1/claims/terms' && req.method === 'GET') return await terms(req, res, url);
      if (path === '/v1/claims/binding' && req.method === 'POST') return await bindClaim(req, res, body);
      if (path === '/v1/claims/claims' && req.method === 'POST') return await claim(req, res, body);
      const draftPath = path.match(/^\/v1\/submission\/(rsv_[A-Za-z0-9_-]{16})\/draft$/);
      if (draftPath && req.method === 'POST') return await draft(req, res, draftPath[1], body);
      const submitPath = path.match(/^\/v1\/submission\/(rsv_[A-Za-z0-9_-]{16})\/submit$/);
      if (submitPath && req.method === 'POST') return await submitDelivery(req, res, submitPath[1], body);
      if (path === '/v1/review' && req.method === 'GET') return await reviewRead(req, res, url);
      if (path === '/v1/review/verdict' && req.method === 'POST') return await verdict(req, res, body);
      if (path === '/v1/review/decision' && req.method === 'POST') return await decision(req, res, body);
      if (path === '/v1/review/authority' && req.method === 'POST') return await authority(req, res, body);
      if (path === '/v1/payouts' && req.method === 'GET') return await payouts(req, res, url);
      if (path === '/v1/operations' && req.method === 'GET') return await readback(req, res, url);
      if (path === '/v1/native-debt/import' && req.method === 'POST') return await importNativeDebt(req, res, body);
      if (path === '/v1/native-debt/enroll' && req.method === 'POST') return await enrollNativeDebt(req, res, body);
      if (path === '/v1/native-debt/enrollment' && req.method === 'GET') return await readEnrollmentView(req, res);
      if (path === '/v1/native-debt' && req.method === 'GET') return await readNativeDebtView(req, res, url);
      return miss(res, next);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped.http && Array.isArray(options.traceErrors)) {
        const message = String(error?.message || '');
        options.traceErrors.push({
          code: error?.code || error?.codeName || null,
          constraint: error?.constraint || null,
          table: error?.table || null,
          routine: error?.routine || null,
          message: /password|cookie|recovery|staging-preserved:|BEGIN |INSERT |UPDATE /i.test(message) ? 'redacted' : message.slice(0, 240),
        });
      }
      if (mapped.http && !res.headersSent && !res.destroyed) return send(res, mapped.http, {ok: false, code: mapped.codeName});
      if (!res.headersSent && !res.destroyed) {
        send(res, 500, {ok: false, code: 'storage_failed'});
      }
    }
  }

  return {
    profile,
    database: profile.databaseName,
    debtConsumer,
    withReadClient: withClient,
    canonicalReceiving: createCanonicalReceiving({consumer: debtConsumer, withReadClient: withClient,
      registryRoot: dischargeRegistry, rpcUrl: profile.rpcUrl}),
    handle: handler,
    setOrigin(value) {
      if (machine && value !== originBox.origin) throw httpError(409, 'machine_origin_changed');
      originBox.origin = value;
    },
    async close() {
      await machine?.close();
      await pool.end();
    },
  };
}

export async function mountHostedWalletMarket(app, options) {
  if (!app || typeof app.use !== 'function') {
    throw Object.assign(new Error('mount_required'), {codeName: 'mount_required'});
  }
  const market = await openHostedMarket(options);
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (!path.startsWith(PREFIX)) return next();
    return market.handle(req, res, next);
  });
  return {
    profile: market.profile,
    database: market.database,
    debtConsumer: market.debtConsumer,
    withReadClient: market.withReadClient,
    canonicalReceiving: market.canonicalReceiving,
    close: market.close,
  };
}

export async function startServer(options) {
  const market = await openHostedMarket({...options, tls: options.tls || 'files'});
  if (market.profile.tls !== 'files') {
    await market.close();
    throw Object.assign(new Error('tls_refused'), {codeName: 'tls_refused'});
  }
  const server = https.createServer({key: pem(options.key), cert: pem(options.cert)}, (req, res) => market.handle(req, res));
  server.on('clientError', () => {});
  server.requestTimeout = 0;
  server.headersTimeout = 60000;
  server.timeout = 0;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, market.profile.listenHost, () => {
        const address = server.address();
        const host = market.profile.listenHost === '127.0.0.1' || market.profile.listenHost === '::1'
          ? market.profile.listenHost
          : address.address;
        const literal = host.includes(':') ? `[${host}]` : host;
        market.setOrigin(`https://${literal}:${address.port}`);
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await market.close();
    throw error;
  }
  const address = server.address();
  const host = market.profile.listenHost === '127.0.0.1' || market.profile.listenHost === '::1'
    ? market.profile.listenHost
    : address.address;
  const literal = host.includes(':') ? `[${host}]` : host;
  return {
    origin: `https://${literal}:${address.port}`,
    port: address.port,
    database: market.database,
    profile: market.profile,
    async close() {
      await new Promise(resolve => server.close(resolve));
      await market.close();
    },
  };
}
