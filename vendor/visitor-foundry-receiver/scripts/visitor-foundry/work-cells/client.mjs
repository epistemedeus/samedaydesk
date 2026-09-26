import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertCorrespondenceOrigin } from '../../correspondence/client.mjs';
import { readBoundedJson } from '../../correspondence/response.mjs';
import { readTokenFileOnce, writeJsonSecretFree } from '../../../packs/contributor-session-grant/src/fs-grant.mjs';
import { tokenFingerprint } from '../../../packs/contributor-session-grant/src/hash.mjs';

export class WorkCellClientError extends Error {
  constructor(code, nextStep, status = null) { super(code); this.code = code; this.nextStep = nextStep; this.status = status; }
}
export class WorkCellClient {
  #token;
  #fetch;
  constructor({ baseUrl, projectId, token, fetch: transport = globalThis.fetch }) {
    this.baseUrl = assertCorrespondenceOrigin(baseUrl);
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(projectId) || !token) throw new Error('projectId and grant required');
    this.projectId = projectId; this.#token = token; this.#fetch = transport;
  }
  static fromTokenFile(options) { return new WorkCellClient({ ...options, token: readTokenFileOnce(options.tokenFile) }); }
  #path(cellId = '') {
    if (cellId && !/^wcl_[a-f0-9]{64}$/.test(cellId)) throw new Error('invalid cellId');
    return `/v1/projects/${this.projectId}/work-cells${cellId ? `/${cellId}` : ''}`;
  }
  async #request(path, command, key) {
    const signal = AbortSignal.timeout(10000);
    let response, payload;
    try {
      response = await this.#fetch(`${this.baseUrl}${path}`, { method: command ? 'POST' : 'GET', redirect: 'error', signal,
        headers: { authorization: `Bearer ${this.#token}`, ...(command ? { 'content-type': 'application/json', 'idempotency-key': key } : {}) },
        ...(command ? { body: JSON.stringify(command) } : {}) });
      payload = await readBoundedJson(response, 2 * 1024 * 1024, signal);
    } catch {
      throw new WorkCellClientError(command ? 'unknown_outcome' : 'unavailable', command ? 'reconcile the persisted attempt with the same grant; do not generate another key' : 'retry bounded read');
    }
    if (![200, 201].includes(response.status)) {
      throw new WorkCellClientError(payload?.error?.code ?? 'unavailable', payload?.error?.nextStep ?? 'reconcile exact attempt', response.status);
    }
    if (command && (payload?.receipt?.schema !== 'neomorphic.foundry.work-cell-receipt.v1' ||
      payload.receipt.cell?.projectId !== this.projectId || !Number.isInteger(payload.receipt.revision))) {
      throw new WorkCellClientError('unknown_outcome', 'empty or invalid success body; reconcile exact attempt');
    }
    return payload;
  }
  get(cellId) { return this.#request(this.#path(cellId)); }
  replay(cellId, { after, limit = 25 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be 1–50');
    const query = new URLSearchParams({ limit: String(limit), ...(after ? { after } : {}) });
    return this.#request(`${this.#path(cellId)}/receipts?${query}`);
  }
  /** Persist before POST. An existing attempt file is never overwritten. */
  async begin({ cellId = '', command, attemptFile, key = randomUUID() }) {
    const path = `${this.#path(cellId)}${cellId ? '/commands' : ''}`;
    if (!command || command.schema !== 'neomorphic.foundry.work-cell-command.v1' ||
      Buffer.byteLength(JSON.stringify(command)) > 24576 || typeof key !== 'string' || key.length < 8 || key.length > 200) throw new Error('invalid command/key');
    const attempt = { schema: 'neomorphic.foundry.work-cell-attempt.v1', baseUrl: this.baseUrl,
      projectId: this.projectId, path, cellId, tokenFingerprint: tokenFingerprint(this.#token), command, key };
    writeJsonSecretFree(attemptFile, attempt, [this.#token], 0o600, 'wx');
    return this.#request(path, command, key);
  }
  reconcile(attemptFile) {
    const saved = JSON.parse(readFileSync(attemptFile, 'utf8'));
    const expectedPath = `${this.#path(saved.cellId)}${saved.cellId ? '/commands' : ''}`;
    if (saved.schema !== 'neomorphic.foundry.work-cell-attempt.v1' || saved.baseUrl !== this.baseUrl ||
      saved.projectId !== this.projectId || saved.path !== expectedPath || saved.tokenFingerprint !== tokenFingerprint(this.#token)) {
      throw new WorkCellClientError('attempt_binding_mismatch', 'restore original origin/project/grant; another session must GET and make its own authorized claim');
    }
    return this.#request(saved.path, saved.command, saved.key);
  }
}
