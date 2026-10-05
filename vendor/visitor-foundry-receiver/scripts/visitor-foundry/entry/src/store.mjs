import { readFile } from 'node:fs/promises';
import { Pool, parsePgSchema, quoteIdent, parsePoolMax, hashToken, hashRequest, issueToken, newId, ApiError } from './deps.mjs';
import { need, profile, validateAttempt, grantToken, SCHEMA, contributionProfile } from './contract.mjs';

/** Durable bounded adapter; existing PostgresStore owns all project/grant/event writes.
 * Separate commits are reconciled by existing immutable keys/hashes, never guessed. */
export class EntryStore {
  constructor({ databaseUrl, schema, correspondence, poolMax = 2, receiver = null }) {
    need(correspondence?.kind === 'postgres', 500, 'postgres_required');
    this.schema = parsePgSchema(schema); this.base = correspondence; this.receiver = receiver;
    if (receiver) need(typeof receiver.id === 'string' && /^[a-z0-9:._-]{1,120}$/.test(receiver.id) &&
      typeof receiver.begin === 'function' && typeof receiver.read === 'function', 500, 'invalid_receiver');
    this.pool = new Pool({ connectionString: databaseUrl, max: parsePoolMax(String(poolMax)),
      connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 6000,
      idleTimeoutMillis: 10000, allowExitOnIdle: true, application_name: 'neomorphic_vf10' });
    this.pool.on('error', () => {});
    this.requests = 0; this.peakRequests = 0; this.pending = 0; this.peakPending = 0; this.active = 0; this.peakActive = 0;
  }
  async tx(fn) {
    need(this.pending < 128, 503, 'entry_busy', 'reconcile_same_attempt');
    this.pending++; this.peakPending = Math.max(this.peakPending, this.pending);
    let c;
    try {
      c = await this.pool.connect(); this.active++; this.peakActive = Math.max(this.peakActive, this.active);
      await c.query('BEGIN'); await c.query(`SET LOCAL search_path TO ${quoteIdent(this.schema)}`);
      await c.query("SET LOCAL lock_timeout='1500ms'");
      await c.query("SET LOCAL idle_in_transaction_session_timeout='15000ms'");
      const value = await fn(c); await c.query('COMMIT'); return value;
    } catch (e) { if (c) await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { if (c) { c.release(); this.active--; } this.pending--; }
  }
  async migrate() {
    const sql = (await Promise.all(['001_entry.sql','002_versioned_profile.sql'].map(name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')))).join('\n');
    await this.tx(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`vf10:migrate:${this.schema}`]);
      await c.query(sql);
    });
  }
  async install(options) {
    const installed = profile(options), receiverId = this.receiver?.id ?? 'disabled';
    await this.tx(async c => {
      await c.query('INSERT INTO correspondence_vf10_installation(singleton,profile,receiver_id,max_enrollments) VALUES(true,$1,$2,$3) ON CONFLICT DO NOTHING',
        [installed, receiverId, options.maxEnrollments]);
      const row = (await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton FOR UPDATE')).rows[0];
      need(hashRequest(row.profile) === hashRequest(installed) && row.receiver_id === receiverId, 409, 'immutable_installation');
    });
    return installed;
  }
  async enableContribution({expectedTerms,id,binding}) {
    need(this.receiver&&typeof this.receiver.installBinding==='function',500,'contribution_receiver_required');
    return this.tx(async c=>{
      const row=(await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton FOR UPDATE')).rows[0];
      need(row&&row.profile.termsHash===expectedTerms,409,'profile_terms_mismatch');
      const next=contributionProfile(row.profile,{id,binding});
      if(row.active_profile){need(hashRequest(row.active_profile)===hashRequest(next)&&row.active_receiver_id===this.receiver.id,409,'immutable_contribution_installation');return next;}
      need(row.receiver_id==='disabled'||row.receiver_id===this.receiver.id,409,'prior_receiver_requires_reconciliation');
      await this.receiver.installBinding(c,next);
      await c.query('UPDATE correspondence_vf10_installation SET active_profile=$1,active_receiver_id=$2 WHERE singleton',[next,this.receiver.id]);
      return next;
    });
  }
  async installation(c) {
    const row = (await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton')).rows[0];
    need(row, 503, 'entry_not_installed');
    need((row.active_receiver_id??row.receiver_id) === (this.receiver?.id ?? 'disabled'), 503, 'receiver_installation_mismatch');
    return {...row,profile:row.active_profile??row.profile,receiver_id:row.active_receiver_id??row.receiver_id};
  }
  async checkReady() { await this.tx(c => this.installation(c)); }
  async describe() {
    return this.tx(async c => {
      const row = await this.installation(c);
      return { schema: SCHEMA, profile: row.profile, availability: row.charged < row.max_enrollments ? 'available' : 'exhausted',
        remainingEnrollments: row.max_enrollments - row.charged, receiver: row.receiver_id,
        clientContract: SCHEMA, nextAction: row.charged < row.max_enrollments ? 'persist_attempt_then_register' : 'continue_original' };
    });
  }
  async reserve(body, key, proof) {
    const binding = validateAttempt(body, key, proof);
    return this.tx(async c => {
      // Lock the installed budget only for this short admission transaction.
      let config = (await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton FOR UPDATE')).rows[0];
      need(config, 503, 'entry_not_installed');
      config={...config,profile:config.active_profile??config.profile,receiver_id:config.active_receiver_id??config.receiver_id};
      need(config.receiver_id === (this.receiver?.id ?? 'disabled'), 503, 'receiver_installation_mismatch');
      const existing = (await c.query('SELECT * FROM correspondence_vf10_registrations WHERE request_id=$1 OR proof_hash=$2', [body.requestId, binding.proofHash])).rows;
      if (existing.length) {
        need(existing.length === 1 && existing[0].proof_hash === binding.proofHash, 401, 'registration_proof_mismatch', 'restore_local_registration');
        need(existing[0].request_id === body.requestId && existing[0].request_hash === binding.requestHash, 409, 'attempt_binding_mismatch', 'restore_exact_attempt');
        return existing[0];
      }
      need(config.profile.profileId === body.profileId && config.profile.termsHash === body.termsHash, 409, 'profile_terms_mismatch', 'read_descriptor');
      need(config.charged < config.max_enrollments, 409, 'enrollment_exhausted');
      const row = (await c.query(`INSERT INTO correspondence_vf10_registrations
        (id,request_id,request_hash,proof_hash,owner_hash,expires_at,grant_expires_at,receiver_state,entry_profile,receiver_id)
        VALUES($1,$2,$3,$4,$5,clock_timestamp()+$6*interval '1 second',clock_timestamp()+$7*interval '1 second',$8,$9,$10) RETURNING *`,
      [newId('ven'), body.requestId, binding.requestHash, binding.proofHash, hashToken(issueToken('neo_own')),
        config.profile.limits.workspaceSeconds, config.profile.limits.grantSeconds, this.receiver ? 'pending' : 'disabled',config.profile,config.receiver_id])).rows[0];
      // Owner preimage is discarded. The visitor cannot derive it; privileged host
      // methods administer the project. Public registration never exposes owner access.
      await c.query('UPDATE correspondence_vf10_installation SET charged=charged+1 WHERE singleton');
      return row;
    });
  }
  async register(...args) {
    need(this.requests < 128, 503, 'entry_busy', 'reconcile_same_attempt');
    this.requests++; this.peakRequests = Math.max(this.peakRequests, this.requests);
    try { return await this.registerBounded(...args); } finally { this.requests--; }
  }
  async registerBounded(body, key, proof, { renew = false } = {}) {
    const reserved = await this.reserve(body, key, proof);
    await this.afterReservation?.(reserved);
    const row = await this.tx(async c => {
      const row = (await c.query('SELECT * FROM correspondence_vf10_registrations WHERE id=$1 FOR UPDATE', [reserved.id])).rows[0];
      const config = await this.installation(c);
      need(row.expires_at > new Date(), 410, 'workspace_expired');
      const createKey = `vf10:${row.id}`;
      const projectBody = { title: 'Private visitor workspace', summary: 'Bounded nonfinancial correspondence; no public sharing or execution authority.' };
      const requestHash = hashRequest(projectBody);
      // Read authoritative bootstrap first: recovery works beyond its 24h replay window.
      const existing = (await c.query("SELECT request_hash,response_json FROM correspondence_idempotency WHERE scope='project_create' AND project_id='' AND key=$1", [createKey])).rows[0];
      let projectId;
      if (existing) {
        need(existing.request_hash === requestHash && existing.response_json.ownerTokenHash === row.owner_hash, 409, 'project_binding_conflict');
        projectId = existing.response_json.project.id;
      } else {
        const created = await this.base.createProject({ ...projectBody, idempotencyKey: createKey,
          requestHash, ownerTokenHash: row.owner_hash, ownerTokenPlainForReplay: '' });
        projectId = created.project.id;
      }
      need(!row.project_id || row.project_id === projectId, 409, 'project_binding_conflict');
      await c.query('UPDATE correspondence_vf10_registrations SET project_id=$2 WHERE id=$1', [row.id, projectId]);
      row.project_id = projectId;
      const grants = [];
      for (const role of ['reader', 'writer']) {
        const tokenHash = hashToken(grantToken(proof, row.id, role));
        let grant = (await c.query('SELECT * FROM correspondence_grants WHERE token_hash=$1', [tokenHash])).rows[0];
        if (!grant) {
          // token_hash is UNIQUE in the existing store. If its commit reply is lost,
          // the next exact request reads this hash instead of creating another grant.
          await this.base.createGrant({ projectId, role, tokenHash, expiresAt: row.grant_expires_at.toISOString() });
          grant = (await c.query('SELECT * FROM correspondence_grants WHERE token_hash=$1', [tokenHash])).rows[0];
        }
        need(grant?.project_id === projectId && grant.role === role, 409, 'grant_binding_conflict');
        grants.push(grant);
      }
      // Lock grants in deterministic order before renewal/revocation readback.
      const locked = (await c.query('SELECT * FROM correspondence_grants WHERE id=ANY($1) ORDER BY id FOR UPDATE', [grants.map(g => g.id)])).rows;
      need(locked.every(g => !g.revoked_at), 403, 'registration_revoked');
      if (renew) {
        // Same rows, same scope, fixed workspace deadline; renewal does not add capacity.
        row.grant_expires_at = (await c.query(`UPDATE correspondence_vf10_registrations
          SET grant_expires_at=LEAST(expires_at,clock_timestamp()+$2*interval '1 second') WHERE id=$1 RETURNING grant_expires_at`,
        [row.id, (row.entry_profile??config.profile).limits.grantSeconds])).rows[0].grant_expires_at;
        await c.query('UPDATE correspondence_grants SET expires_at=$2 WHERE id=ANY($1)', [grants.map(g => g.id), row.grant_expires_at]);
      } else need(locked.every(g => g.expires_at && g.expires_at > new Date()), 401, 'grant_expired', 'renew_same_registration');
      return row;
    });
    const receiverState = await this.reconcileReceiver(row);
    // Accounting, project binding, grants and exact receiver state all precede exposure.
    return { schema: SCHEMA, status: receiverState === 'pending' || receiverState === 'unknown' ? 'partial' : 'ready',
      requestId: body.requestId, profileId: body.profileId, termsHash: body.termsHash,
      registrationId: row.id, projectId: row.project_id, workspaceExpiresAt: row.expires_at.toISOString(),
      receiver: { state: receiverState }, nextAction: ['pending', 'unknown'].includes(receiverState) ? 'reconcile_same_attempt' : 'use_private_correspondence',
      grants: Object.fromEntries(['reader', 'writer'].map(role => [role, { role, token: grantToken(proof, row.id, role), expiresAt: row.grant_expires_at.toISOString() }])) };
  }
  async reconcileReceiver(row) {
    if(row.receiver_id==='disabled'||!this.receiver)return 'disabled';
    need(row.receiver_id===this.receiver.id,503,'receiver_installation_mismatch');
    const input = { registrationId: row.id, projectId: row.project_id };
    const decision = await this.tx(async c => {
      const current = (await c.query('SELECT receiver_started,receiver_state FROM correspondence_vf10_registrations WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
      if (current.receiver_started) return { begin: false, state: current.receiver_state };
      // Persist uncertainty BEFORE crossing a separately committed receiving port.
      await c.query("UPDATE correspondence_vf10_registrations SET receiver_started=true,receiver_state='unknown' WHERE id=$1", [row.id]);
      return { begin: true, state: 'unknown' };
    });
    if (['ready', 'declined'].includes(decision.state)&&!row.entry_profile?.contribution) return decision.state;
    // A thrown/unknown begin is never repeated. An exact pending readback proves
    // a committed reservation that canonical recovery may finish, even on restart.
    const bounded = async (method, options) => {
      const controller = new AbortController(); let timer;
      try { return await Promise.race([
        Promise.resolve().then(() => this.receiver[method]({ ...input, signal: controller.signal }, options)),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('receiver deadline')); }, 1000); }),
      ]); } finally { clearTimeout(timer); controller.abort(); }
    };
    await this.afterReceiverMarker?.(row,decision);
    if (decision.begin) { try { await bounded('begin'); } catch {} }
    let state = 'unknown';
    try { state = await bounded('read'); } catch {}
    if (state === 'pending' && typeof this.receiver.recover === 'function') {
      // No absent-begin fencing from a public continuation. This is completion
      // of an already charged reservation, not another admission or begin call.
      try { await bounded('recover', { reservedOnly: true }); } catch {}
      // A recovery response alone never replaces authoritative bound readback.
      try { state = await bounded('read'); } catch { state = 'unknown'; }
    }
    if(row.entry_profile?.contribution&&['ready','declined'].includes(decision.state)&&state!==decision.state)return 'unknown';
    need(['unknown', 'pending', 'ready', 'declined'].includes(state), 503, 'receiver_invalid_readback', 'reconcile_same_attempt');
    return this.tx(async c => {
      // Terminal enrollment readback is monotonic: a slow earlier pending read
      // cannot overwrite another process's exact ready/declined acknowledgment.
      const current = (await c.query('SELECT receiver_state FROM correspondence_vf10_registrations WHERE id=$1 FOR UPDATE', [row.id])).rows[0].receiver_state;
      if (['ready', 'declined'].includes(current)) return current;
      await c.query('UPDATE correspondence_vf10_registrations SET receiver_state=$2 WHERE id=$1', [row.id, state]);
      return state;
    });
  }

  boundedCorrespondence() {
    const entry = this;
    return new Proxy(this.base, { get(target, key) {
      if (key === 'createEvent') return async input => {
        // Reserve first. A process/connection loss between commits cannot release
        // capacity while the base store may still be committing an event.
        await entry.tx(async c => {
          const row = (await c.query('SELECT * FROM correspondence_vf10_registrations WHERE project_id=$1 FOR UPDATE', [input.projectId])).rows[0];
          if (!row) return;
          const existing = (await c.query('SELECT request_hash FROM correspondence_vf10_event_reservations WHERE project_id=$1 AND request_key=$2',
            [input.projectId, input.idempotencyKey])).rows[0];
          if (existing) {
            if (existing.request_hash !== input.requestHash) throw new ApiError(409, 'idempotency_conflict', 'restore exact event intent');
            return;
          }
          const count = Number((await c.query('SELECT count(*) FROM correspondence_vf10_event_reservations WHERE project_id=$1', [input.projectId])).rows[0].count);
          const config = await entry.installation(c);
          if (row.expires_at <= new Date() || count >= (row.entry_profile??config.profile).limits.maxEvents)
            throw new ApiError(409, 'visitor_workspace_limit', 'workspace write budget exhausted; continue original task or read existing correspondence');
          await c.query('INSERT INTO correspondence_vf10_event_reservations(project_id,request_key,request_hash) VALUES($1,$2,$3)',
            [input.projectId, input.idempotencyKey, input.requestHash]);
        });
        return target.createEvent(input);
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  async isVisitorToken(token) {
    if (!token) return false;
    return this.tx(async c => !!(await c.query(`SELECT 1 FROM correspondence_grants g
      JOIN correspondence_vf10_registrations r ON r.project_id=g.project_id WHERE g.token_hash=$1`, [hashToken(token)])).rowCount);
  }
  close() { return this.pool.end(); }
}
