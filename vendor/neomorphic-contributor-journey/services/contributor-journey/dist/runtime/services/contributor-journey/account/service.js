import { readFileSync } from "node:fs";
import { hashToken, issueToken, newId, tokensEqual } from "../../earned-work/src/crypto.js";
import { ApiError } from "../../earned-work/src/errors.js";
import { AccountReceiptCipher, hashPassword, verifyPassword } from "./credentials.js";
import { adoptionSchema, loginSchema, operationProofSchema, parse, readbackSchema, receiptSchema, recoverSchema, sessionTokenSchema, signupSchema, kernelScopeSchema } from "./validation.js";
const ERROR_CODES = new Set(["disabled", "invalid_input", "unauthorized", "not_found", "conflict", "rate_limited", "unavailable", "forbidden"]);
function refuse() { throw new ApiError(401, "unauthorized", "Account credentials or session are invalid."); }
function invalidBinding() { throw new ApiError(403, "forbidden", "The scoped contributor proof does not match this binding."); }
function boundedSeconds(value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max)
        throw new Error("Account lifetime configuration is outside its bounds");
    return value;
}
export async function migrateContributorAccounts(database) {
    const sql = readFileSync(new URL("./migrations/001_accounts.sql", import.meta.url), "utf8");
    await database.withOpportunityClient(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('journey_accounts_migrate',0))");
        await client.query(sql);
    }, "idempotent");
}
export class ContributorAccountService {
    options;
    database;
    cipher;
    ttl;
    fresh;
    allowed;
    constructor(options) {
        this.options = options;
        this.database = options.database;
        this.cipher = new AccountReceiptCipher(options.replayKey);
        this.ttl = boundedSeconds(options.sessionTtlSeconds ?? 86400, 300, 604800);
        this.fresh = boundedSeconds(options.freshAuthSeconds ?? 300, 60, 900);
        this.allowed = new Set(options.allowedKernelProvenance ?? ["test", "fixture"]);
        if (this.allowed.size === 0 || [...this.allowed].some(value => !["test", "fixture", "production"].includes(value)))
            throw new Error("Invalid account kernel provenance configuration");
    }
    enabled() {
        if (this.options.enabled !== true)
            throw new ApiError(503, "disabled", "Contributor accounts are not open here yet.");
    }
    async result(fn) {
        try {
            this.enabled();
            return { ok: true, ...await fn() };
        }
        catch (error) {
            if (error instanceof ApiError && ERROR_CODES.has(error.code)) {
                return { ok: false, error: { code: error.code, status: error.status, message: error.message } };
            }
            // Do not echo driver messages, account inputs, credentials or kernel rows.
            return { ok: false, error: { code: "unavailable", status: 503, message: "Account outcome is unknown. Read back or retry the same operation." } };
        }
    }
    async limit(context, target) {
        if (!context || typeof context.clientAddress !== "string" || context.clientAddress.length < 1 || context.clientAddress.length > 128) {
            throw new ApiError(400, "invalid_input", "Server request context is required.");
        }
        const now = this.database.now();
        const keys = [{ key: `source:${context.clientAddress}`, max: 30 }];
        if (target)
            keys.push({ key: `target:${target}`, max: 8 });
        const counts = await this.database.withOpportunityClient(async (client) => {
            const values = [];
            for (const key of keys) {
                const result = await client.query(`
          INSERT INTO journey_account_limits(key_hash,window_start,attempts) VALUES($1,$2,1)
          ON CONFLICT(key_hash) DO UPDATE SET
            attempts=CASE WHEN journey_account_limits.window_start <= $2::timestamptz - interval '60 seconds' THEN 1 ELSE journey_account_limits.attempts+1 END,
            window_start=CASE WHEN journey_account_limits.window_start <= $2::timestamptz - interval '60 seconds' THEN $2 ELSE journey_account_limits.window_start END
          RETURNING attempts`, [this.cipher.digest(key.key, "limit"), now]);
                values.push({ count: result.rows[0].attempts, max: key.max });
            }
            return values;
        }, "idempotent");
        if (counts.some(value => value.count > value.max))
            throw new ApiError(429, "rate_limited", "Too many account attempts. Try again in a minute with the same operation.");
    }
    operationContext(operation, scope, proof) {
        return `account-v1:${operation}:${scope}:${proof.idempotencyKey}`;
    }
    async session(client, tokenHash, lockAccount = false) {
        const row = await client.query(`
      SELECT s.*,a.auth_version AS current_auth_version,a.public_profile_id,a.recovery_hash
      FROM journey_account_sessions s JOIN journey_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 ${lockAccount ? "FOR SHARE OF a" : ""}`, [tokenHash]);
        return row.rows[0] ?? null;
    }
    accountFromSession(row) {
        const now = this.database.now().getTime();
        if (!row || row.revoked_at || row.auth_version !== row.current_auth_version ||
            !(row.auth_time instanceof Date) || !(row.expires_at instanceof Date) ||
            !Number.isFinite(row.auth_time.getTime()) || !Number.isFinite(row.expires_at.getTime()) ||
            row.auth_time.getTime() > now || row.expires_at.getTime() <= now)
            refuse();
        const account = {
            accountId: row.account_id, sessionId: row.id, publicProfileId: row.public_profile_id,
            authTime: row.auth_time.toISOString(), expiresAt: row.expires_at.toISOString(),
        };
        // A malformed persistent row cannot become a public/authenticated DTO.
        const parsed = receiptSchema.shape.account.safeParse(account);
        if (!parsed.success)
            throw new ApiError(503, "unavailable", "Stored account session needs repair.");
        return parsed.data;
    }
    async authenticated(client, token, lockAccount = false) {
        return this.accountFromSession(await this.session(client, hashToken(token), lockAccount));
    }
    async savedReceipt(client, row, proof, expectedHash) {
        const context = this.operationContext(row.operation, row.scope, proof);
        if (!tokensEqual(row.proof_hash, this.cipher.digest(proof.proof, `proof:${context}`))) {
            throw new ApiError(404, "not_found", "Account operation was not found.");
        }
        if (expectedHash && !tokensEqual(row.request_hash, expectedHash))
            throw new ApiError(409, "conflict", "This operation already has different account fields.");
        if (!(row.expires_at instanceof Date) || row.expires_at.getTime() <= this.database.now().getTime()) {
            throw new ApiError(409, "conflict", "This account operation has expired. Sign in again.");
        }
        const receipt = receiptSchema.safeParse(this.cipher.open(row.sealed_response, context));
        if (!receipt.success)
            throw new ApiError(503, "unavailable", "Stored account result needs repair.");
        const session = await this.session(client, hashToken(receipt.data.sessionToken));
        const account = this.accountFromSession(session);
        if (row.account_id !== account.accountId || row.session_id !== account.sessionId || row.auth_version !== session.auth_version ||
            JSON.stringify(account) !== JSON.stringify(receipt.data.account) ||
            (receipt.data.recoveryCode && !tokensEqual(hashToken(receipt.data.recoveryCode), session.recovery_hash))) {
            throw new ApiError(503, "unavailable", "Stored account result does not match its session.");
        }
        return receipt.data;
    }
    async sessionOperation(operation, scope, body, proof, write) {
        const context = this.operationContext(operation, scope, proof);
        const requestHash = this.cipher.digest(body, `request:${context}`);
        return this.database.withOpportunityClient(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [context]);
            const prior = await client.query("SELECT * FROM journey_account_operations WHERE operation=$1 AND scope=$2 AND idempotency_key=$3", [operation, scope, proof.idempotencyKey]);
            if (prior.rows[0])
                return { value: await this.savedReceipt(client, prior.rows[0], proof, requestHash), replayed: true };
            const { account, recoveryCode } = await write(client);
            const now = this.database.now(), expiresAt = new Date(now.getTime() + this.ttl * 1000);
            const sessionId = newId("ses"), sessionToken = issueToken("acs");
            await client.query(`INSERT INTO journey_account_sessions(id,account_id,token_hash,auth_version,auth_time,expires_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [sessionId, account.id, hashToken(sessionToken), account.auth_version, now, expiresAt]);
            const value = {
                account: { accountId: account.id, sessionId, publicProfileId: account.public_profile_id, authTime: now.toISOString(), expiresAt: expiresAt.toISOString() },
                sessionToken, ...(recoveryCode ? { recoveryCode } : {}),
            };
            await client.query(`INSERT INTO journey_account_operations(operation,scope,idempotency_key,proof_hash,request_hash,account_id,session_id,auth_version,sealed_response,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [operation, scope, proof.idempotencyKey,
                this.cipher.digest(proof.proof, `proof:${context}`), requestHash, account.id, sessionId, account.auth_version, this.cipher.seal(value, context), now, expiresAt]);
            return { value, replayed: false };
        }, "idempotent");
    }
    async signup(input, operationProof, context) {
        return this.result(async () => {
            const body = parse(signupSchema, input), proof = parse(operationProofSchema, operationProof);
            await this.limit(context);
            return this.sessionOperation("signup", "new", body, proof, async (client) => {
                const id = newId("acc"), publicProfileId = newId("prf"), recoveryCode = issueToken("acr");
                const password = await hashPassword(body.password);
                const row = await client.query(`INSERT INTO journey_accounts(id,public_profile_id,display_name,contact_email,password_record,recovery_hash,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`, [id, publicProfileId, body.displayName ?? null, body.contactEmail ?? null, password, hashToken(recoveryCode), this.database.now()]);
                return { account: row.rows[0], recoveryCode };
            });
        });
    }
    async login(input, operationProof, context) {
        return this.result(async () => {
            const body = parse(loginSchema, input), proof = parse(operationProofSchema, operationProof);
            await this.limit(context, body.accountId);
            return this.sessionOperation("login", body.accountId, body, proof, async (client) => {
                const row = await client.query("SELECT * FROM journey_accounts WHERE id=$1 FOR UPDATE", [body.accountId]);
                const account = row.rows[0];
                if (!await verifyPassword(body.password, account?.password_record ?? null) || !account)
                    refuse();
                return { account };
            });
        });
    }
    async recover(input, operationProof, context) {
        return this.result(async () => {
            const body = parse(recoverSchema, input), proof = parse(operationProofSchema, operationProof);
            await this.limit(context, body.accountId);
            return this.sessionOperation("recover", body.accountId, body, proof, async (client) => {
                const row = await client.query("SELECT * FROM journey_accounts WHERE id=$1 FOR UPDATE", [body.accountId]);
                const account = row.rows[0];
                if (!account || !tokensEqual(account.recovery_hash, hashToken(body.recoveryCode)))
                    refuse();
                const password = await hashPassword(body.newPassword), recoveryCode = issueToken("acr");
                const next = await client.query(`UPDATE journey_accounts SET password_record=$2,recovery_hash=$3,auth_version=auth_version+1,updated_at=$4 WHERE id=$1 RETURNING *`, [account.id, password, hashToken(recoveryCode), this.database.now()]);
                await client.query("UPDATE journey_account_sessions SET revoked_at=$2 WHERE account_id=$1 AND revoked_at IS NULL", [account.id, this.database.now()]);
                return { account: next.rows[0], recoveryCode };
            });
        });
    }
    async readback(input, operationProof, context) {
        return this.result(async () => {
            const body = parse(readbackSchema, input), proof = parse(operationProofSchema, operationProof);
            await this.limit(context);
            const scope = body.operation === "signup" ? "new" : body.accountId;
            return this.database.withOpportunityClient(async (client) => {
                const row = await client.query("SELECT * FROM journey_account_operations WHERE operation=$1 AND scope=$2 AND idempotency_key=$3", [body.operation, scope, proof.idempotencyKey]);
                if (!row.rows[0])
                    throw new ApiError(404, "not_found", "Account operation was not found.");
                return { value: await this.savedReceipt(client, row.rows[0], proof), replayed: true };
            }, "read");
        });
    }
    async authenticate(sessionToken) {
        return this.result(async () => {
            // Absent/malformed bearer has the same auth result as a nonexistent session.
            const parsed = sessionTokenSchema.safeParse(sessionToken);
            if (!parsed.success)
                refuse();
            const account = await this.database.withOpportunityClient(client => this.authenticated(client, parsed.data), "read");
            return { value: account, replayed: false };
        });
    }
    async logout(sessionToken, allSessions = false) {
        return this.result(async () => {
            const token = sessionTokenSchema.safeParse(sessionToken);
            if (!token.success)
                refuse();
            if (typeof allSessions !== "boolean")
                throw new ApiError(400, "invalid_input", "Invalid session revocation.");
            return this.database.withOpportunityClient(async (client) => {
                const rows = await client.query(`SELECT s.*,a.auth_version AS current_auth_version,a.public_profile_id,a.recovery_hash
          FROM journey_account_sessions s JOIN journey_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 FOR UPDATE OF a,s`, [hashToken(token.data)]);
                const row = rows.rows[0];
                if (!row)
                    refuse();
                // A retry for an old session must not revoke sessions issued after recovery/sign-in.
                if (row.revoked_at || row.auth_version !== row.current_auth_version)
                    return { value: { revoked: true }, replayed: true };
                if (allSessions) {
                    const account = this.accountFromSession(row);
                    this.requireFresh(account);
                    await client.query("UPDATE journey_accounts SET auth_version=auth_version+1,updated_at=$2 WHERE id=$1", [row.account_id, this.database.now()]);
                    await client.query("UPDATE journey_account_sessions SET revoked_at=$2 WHERE account_id=$1 AND revoked_at IS NULL", [row.account_id, this.database.now()]);
                }
                else
                    await client.query("UPDATE journey_account_sessions SET revoked_at=$2 WHERE id=$1", [row.id, this.database.now()]);
                return { value: { revoked: true }, replayed: false };
            }, "idempotent");
        });
    }
    requireFresh(account) {
        if (this.database.now().getTime() - Date.parse(account.authTime) > this.fresh * 1000)
            throw new ApiError(403, "forbidden", "Sign in again before changing account authority.");
    }
    async bindingScope(scope) {
        let provenance, taskId = null, roundId = null;
        if (scope.startsWith("opportunity:")) {
            roundId = scope.slice("opportunity:".length);
            const row = await this.database.withOpportunityClient(client => client.query("SELECT id,provenance FROM opportunity_rounds WHERE id=$1", [roundId]), "read");
            if (!row.rows[0])
                throw new ApiError(404, "not_found", "Opportunity round was not found.");
            provenance = row.rows[0].provenance;
        }
        else {
            taskId = scope;
            const task = await this.options.kernel.getTask(taskId);
            if (!task || task.task.id !== taskId)
                throw new ApiError(404, "not_found", "Task was not found.");
            provenance = task.task.provenance;
            const actual = await this.database.withOpportunityClient(client => client.query("SELECT provenance FROM earned_work_tasks WHERE id=$1", [taskId]), "read");
            if (!actual.rows[0] || actual.rows[0].provenance !== provenance)
                throw new ApiError(503, "unavailable", "Kernel scope source does not match persistence.");
        }
        if (!this.allowed.has(provenance))
            throw new ApiError(403, "forbidden", "Kernel scope is outside this account service's admission.");
        return { provenance, taskId, roundId };
    }
    assertBinding(binding, principal, provenance) {
        if (binding.principal_id !== null && binding.principal_id !== principal.id)
            invalidBinding();
        if (principal.publicId !== binding.public_id || principal.taskScope !== binding.kernel_scope || principal.provenance !== provenance ||
            (principal.expiresAt !== null && Date.parse(principal.expiresAt) <= this.database.now().getTime()) ||
            (principal.expiresAt !== null && !Number.isFinite(Date.parse(principal.expiresAt))) ||
            (binding.source === "created" && (principal.payoutDestination !== null || principal.expiresAt !== null)))
            invalidBinding();
    }
    async checkLiveKernelProof(client, hash, principal) {
        const rows = await client.query(`SELECT id FROM earned_work_contributor_tokens
      WHERE id=$1 AND token_hash=$2 AND public_id=$3 AND task_scope=$4 AND provenance=$5
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$6)
        AND payout_destination IS NOT DISTINCT FROM $7 AND expires_at IS NOT DISTINCT FROM $8::timestamptz
      FOR SHARE`, [principal.id, hash, principal.publicId, principal.taskScope, principal.provenance,
            this.database.now(), principal.payoutDestination, principal.expiresAt]);
        if (!rows.rows[0])
            invalidBinding();
    }
    /** Server-only result. Never serialize this principal or expose a kernel bearer to the browser. */
    async resolveKernelPrincipal(sessionToken, requestedKernelScope) {
        return this.result(async () => {
            const token = sessionTokenSchema.safeParse(sessionToken);
            if (!token.success)
                refuse();
            const kernelScope = parse(kernelScopeSchema, requestedKernelScope);
            const account = await this.database.withOpportunityClient(client => this.authenticated(client, token.data), "read");
            const scope = await this.bindingScope(kernelScope), provenance = scope.provenance;
            const binding = await this.database.withOpportunityClient(async (client) => {
                const current = await this.authenticated(client, token.data, true);
                if (current.accountId !== account.accountId)
                    refuse();
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`binding:${account.accountId}:${kernelScope}`]);
                await client.query(`INSERT INTO journey_account_kernel_bindings(account_id,kernel_scope,public_id,token_hash,source,created_at,earned_task_id,opportunity_round_id)
          VALUES($1,$2,$3,$4,'created',$5,$6,$7) ON CONFLICT(account_id,kernel_scope) DO NOTHING`, [account.accountId, kernelScope, newId("ctr"), hashToken(issueToken("ew-private")), this.database.now(), scope.taskId, scope.roundId]);
                const rows = await client.query("SELECT * FROM journey_account_kernel_bindings WHERE account_id=$1 AND kernel_scope=$2", [account.accountId, kernelScope]);
                return rows.rows[0];
            }, "idempotent");
            let principal = await this.options.kernel.findContributorByTokenHash(binding.token_hash);
            if (!principal && binding.principal_id !== null)
                invalidBinding(); // Revoked/expired established principal is never replaced.
            if (!principal) {
                try {
                    await this.options.kernel.createContributorToken({ publicId: binding.public_id, tokenHash: binding.token_hash,
                        taskScope: kernelScope, payoutDestination: null, provenance, expiresAt: null });
                }
                catch { /* Resolve the exact persisted hash, including a lost create ACK or concurrent issuer. */ }
                principal = await this.options.kernel.findContributorByTokenHash(binding.token_hash);
            }
            if (!principal)
                throw new ApiError(503, "unavailable", "Contributor binding outcome is unknown. Retry this same account and task.");
            this.assertBinding(binding, principal, provenance);
            const resolved = principal;
            return this.database.withOpportunityClient(async (client) => {
                const current = await this.authenticated(client, token.data, true);
                if (current.accountId !== account.accountId)
                    refuse();
                const rows = await client.query("SELECT * FROM journey_account_kernel_bindings WHERE account_id=$1 AND kernel_scope=$2 FOR UPDATE", [account.accountId, kernelScope]);
                if (!rows.rows[0])
                    invalidBinding();
                this.assertBinding(rows.rows[0], resolved, provenance);
                await this.checkLiveKernelProof(client, binding.token_hash, resolved);
                await client.query("UPDATE journey_account_kernel_bindings SET principal_id=$3 WHERE account_id=$1 AND kernel_scope=$2 AND principal_id IS NULL", [account.accountId, kernelScope, resolved.id]);
                return { value: { account: current, principal: resolved }, replayed: binding.principal_id !== null };
            }, "idempotent");
        });
    }
    /** Possession of a live task-scoped kernel bearer is required; alias/email cannot adopt. */
    async adoptKernelPrincipal(sessionToken, input) {
        return this.result(async () => {
            const token = sessionTokenSchema.safeParse(sessionToken);
            if (!token.success)
                refuse();
            const body = parse(adoptionSchema, input);
            const account = await this.database.withOpportunityClient(client => this.authenticated(client, token.data), "read");
            this.requireFresh(account);
            const scope = await this.bindingScope(body.kernelScope), provenance = scope.provenance, tokenHash = hashToken(body.contributorToken);
            const principal = await this.options.kernel.findContributorByTokenHash(tokenHash);
            if (!principal || principal.taskScope !== body.kernelScope || principal.provenance !== provenance)
                invalidBinding();
            return this.database.withOpportunityClient(async (client) => {
                const current = await this.authenticated(client, token.data, true);
                this.requireFresh(current);
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`adopt:${tokenHash}`]);
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`binding:${current.accountId}:${body.kernelScope}`]);
                const other = await client.query("SELECT * FROM journey_account_kernel_bindings WHERE token_hash=$1 OR principal_id=$2", [tokenHash, principal.id]);
                if (other.rows.some(row => row.account_id !== current.accountId || row.kernel_scope !== body.kernelScope))
                    throw new ApiError(409, "conflict", "Contributor proof is already bound to another account.");
                const prior = await client.query("SELECT * FROM journey_account_kernel_bindings WHERE account_id=$1 AND kernel_scope=$2", [current.accountId, body.kernelScope]);
                if (prior.rows[0]) {
                    if (prior.rows[0].token_hash !== tokenHash)
                        throw new ApiError(409, "conflict", "This account already has a different task principal.");
                    this.assertBinding(prior.rows[0], principal, provenance);
                    return { value: { bound: true }, replayed: true };
                }
                // Recheck the actual bearer at the final adoption boundary; a revoked proof is not authority.
                await this.checkLiveKernelProof(client, tokenHash, principal);
                await client.query(`INSERT INTO journey_account_kernel_bindings(account_id,kernel_scope,public_id,token_hash,principal_id,source,created_at,earned_task_id,opportunity_round_id)
          VALUES($1,$2,$3,$4,$5,'adopted',$6,$7,$8)`, [current.accountId, body.kernelScope, principal.publicId, tokenHash, principal.id, this.database.now(), scope.taskId, scope.roundId]);
                return { value: { bound: true }, replayed: false };
            }, "idempotent");
        });
    }
}
//# sourceMappingURL=service.js.map