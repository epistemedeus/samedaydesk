import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Budget, JourneyError, parseJson, readFileBounded, readResponse, within } from "./lib/budget.mjs";

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
const fingerprint = value => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const prefix = "/api/hosted-useful";

function safeOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new JourneyError(400, "origin_required"); }
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new JourneyError(400, "invalid_origin");
  return url.origin;
}

export async function saveJournal(path, value, budget) {
  budget.check();
  const target = resolve(path);
  await within(mkdir(dirname(target), { recursive: true, mode: 0o700 }), budget);
  const temp = `${target}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await within(open(temp, "wx", 0o600), budget);
    const bytes = Buffer.from(JSON.stringify(value));
    budget.spend(bytes.length, "customer-journal-write");
    await within(file.writeFile(bytes), budget);
    await within(file.sync(), budget);
    await file.close(); file = null;
    await within(rename(temp, target), budget);
    const directory = await within(open(dirname(target), "r"), budget);
    try { await within(directory.sync(), budget); } finally { await directory.close(); }
  } finally { await file?.close(); await rm(temp, { force: true }); }
}

export class UsefulJourneyClient {
  constructor({ origin, projectId, token, budget = new Budget(), fetchImpl = globalThis.fetch }) {
    this.origin = safeOrigin(origin);
    this.projectId = projectId;
    this.token = token;
    this.budget = budget;
    this.fetchImpl = fetchImpl;
  }
  jobs() {
    if (typeof this.projectId !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(this.projectId)) throw new JourneyError(400, "project_required");
    return `${prefix}/projects/${encodeURIComponent(this.projectId)}/jobs`;
  }
  async call(method, path, body, key, anonymous = false) {
    this.budget.check();
    const controller = new AbortController();
    const headers = { accept: "application/json", "x-useful-deadline-at": String(this.budget.deadlineAt) };
    if (!anonymous) {
      if (typeof this.token !== "string" || !/^\S{8,200}$/.test(this.token)) throw new JourneyError(401, "grant_required");
      headers.authorization = `Bearer ${this.token}`;
    }
    let bytes;
    if (body !== undefined) {
      bytes = JSON.stringify(body);
      this.budget.spend(Buffer.byteLength(bytes), "http-request");
      headers["content-type"] = "application/json";
    }
    if (key) headers["idempotency-key"] = key;
    try {
      const response = await within(this.fetchImpl(`${this.origin}${path}`, { method, headers, body: bytes,
        redirect: "manual", signal: controller.signal }), this.budget, 0, () => controller.abort());
      if (response.status >= 300 && response.status < 400) throw new JourneyError(502, "redirect_refused");
      const json = parseJson(await readResponse(response, this.budget));
      if (!response.ok) throw new JourneyError(response.status, json.error?.code || "request_failed", json.error?.nextAction);
      return json;
    } catch (error) {
      if (error instanceof JourneyError) throw error;
      throw new JourneyError(503, "transport_outcome_unknown", "Recover using the same saved journal, origin, project, task, body and operation key. Do not create a new operation to hide reply loss.");
    } finally { controller.abort(); }
  }
  async evaluate(request) { return await this.call("POST", `${prefix}/evaluate`, request, undefined, true); }
  async status(jobId, taskId) { return await this.call("GET", `${this.jobs()}/${encodeURIComponent(jobId)}?taskId=${encodeURIComponent(taskId)}`); }
  async result(jobId, taskId) { return await this.call("GET", `${this.jobs()}/${encodeURIComponent(jobId)}/result?taskId=${encodeURIComponent(taskId)}`); }
  async cancel(jobId, taskId, reason, key) {
    const status = await this.status(jobId, taskId);
    return await this.call("POST", `${this.jobs()}/${encodeURIComponent(jobId)}/cancel`, { taskId, expectedRevision: status.revision, fence: status.fence || undefined, reason }, key);
  }
  async export(jobId, body) { return await this.call("POST", `${this.jobs()}/${encodeURIComponent(jobId)}/export`, body); }
  // Journal is durable BEFORE admission; it stores no bearer. Recover replays
  // the exact admission, then consults current state before doing any work.
  async run(request, operationKey, journalPath, { recover = false } = {}) {
    if (!journalPath) throw new JourneyError(400, "journal_required");
    let journal;
    if (recover) {
      journal = parseJson(await readFileBounded(journalPath, this.budget, 131_072));
      if (journal.schema !== "samedaydesk.useful-client-journal.v1" || journal.origin !== this.origin || journal.projectId !== this.projectId
        || fingerprint(journal.request) !== journal.requestHash || !journal.operationKey) throw new JourneyError(409, "journal_binding_mismatch");
      request = journal.request;
      operationKey = journal.operationKey;
    } else {
      journal = { schema: "samedaydesk.useful-client-journal.v1", origin: this.origin, projectId: this.projectId,
        operationKey, request, requestHash: fingerprint(request), jobId: null };
      // Existing journals cannot silently move to a different operation.
      try {
        const prior = parseJson(await readFileBounded(journalPath, this.budget, 131_072));
        if (prior.origin !== journal.origin || prior.projectId !== journal.projectId || prior.operationKey !== operationKey
          || prior.requestHash !== journal.requestHash) throw new JourneyError(409, "journal_binding_mismatch");
        journal = prior;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      await saveJournal(journalPath, journal, this.budget);
    }
    // Even a locally retained job id is a hint. Rebind to the owning server's
    // exact operation/body/grant before trusting it after a cold restart.
    const admitted = await this.call("POST", this.jobs(), request, operationKey);
    if (journal.jobId && journal.jobId !== admitted.jobId) throw new JourneyError(409, "journal_job_mismatch");
    journal.jobId = admitted.jobId;
    await saveJournal(journalPath, journal, this.budget);
    let status = await this.status(journal.jobId, request.taskId);
    if (status.state === "ready") status = await this.call("POST", `${this.jobs()}/${encodeURIComponent(journal.jobId)}/run`, { taskId: request.taskId });
    if (status.state === "completed" || status.state === "failed") return await this.result(journal.jobId, request.taskId);
    return status;
  }
}
