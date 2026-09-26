import {
  PAGE_EVENT_LIMIT,
  WINDOW_EVENT_LIMIT,
} from "./constants.mjs";
import { parseCheckpoint, serializeCheckpoint } from "./checkpoint.mjs";
import {
  CorrespondenceClient,
  assertCorrespondenceOrigin,
  createIdempotencyKey,
} from "./client.mjs";
import { buildCorrespondenceRecordBundle } from "./record-bundle.mjs";
import { CorrespondenceError, UnknownOutcomeError } from "./errors.mjs";
import { collectSecrets, redactString } from "./redact.mjs";
import { validateEventPost, validateId } from "./validate.mjs";

export { PAGE_EVENT_LIMIT, WINDOW_EVENT_LIMIT };

const DISCONNECT_GUIDANCE =
  "Reconnect to the same origin and project, then reconcile with this Idempotency-Key. Do not mint a replacement key.";

function emptyBusy() {
  return { connect: false, history: false, submit: false, resume: false };
}

export function canonicalEventBody(body) {
  return JSON.stringify(validateEventPost(body));
}

export function identitiesEqual(a, b) {
  if (!a || !b || !a.projectId || !b.projectId || !a.baseUrl || !b.baseUrl) return false;
  try {
    return (
      a.projectId === b.projectId &&
      assertCorrespondenceOrigin(a.baseUrl) === assertCorrespondenceOrigin(b.baseUrl)
    );
  } catch {
    return false;
  }
}

export function mergeEventWindow(existing, incoming, windowLimit = WINDOW_EVENT_LIMIT) {
  const byId = new Map();
  for (const event of existing || []) {
    if (event?.id) byId.set(event.id, event);
  }
  for (const event of incoming || []) {
    if (event?.id) byId.set(event.id, event);
  }
  const ordered = [...byId.values()].sort((left, right) => {
    const seq = (left.sequence || 0) - (right.sequence || 0);
    if (seq !== 0) return seq;
    return String(left.id).localeCompare(String(right.id));
  });
  const truncated = ordered.length > windowLimit;
  const events = truncated ? ordered.slice(-windowLimit) : ordered;
  return {
    events,
    truncated,
    windowStartSequence: events[0]?.sequence ?? null,
    windowEndSequence: events.length ? events[events.length - 1].sequence : null,
  };
}

function classifyError(error) {
  if (error instanceof UnknownOutcomeError) return "unknown";
  if (error && error.status === 409) return "conflict";
  if (error && error.status === 401) return "revoked";
  if (error && (error.code === "unavailable" || error.status == null)) return "offline";
  return "error";
}

export class WorkbenchSession {
  constructor() {
    this.generation = 0;
    this.token = null;
    this.client = null;
    this.fixture = null;
    this.projectId = "";
    this.baseUrl = "";
    this.project = null;
    this.events = [];
    this.nextCursor = null;
    this.retainedCursor = null;
    this.windowTruncated = false;
    this.loadMoreEnabled = false;
    this.lastMutation = null;
    this.status = null;
    this.#busy = emptyBusy();
  }

  #busy;

  view() {
    const mutation = this.lastMutation
      ? {
          key: this.lastMutation.key,
          state: this.lastMutation.state,
          body: this.lastMutation.body,
          projectId: this.lastMutation.projectId,
          baseUrl: this.lastMutation.baseUrl,
          guidance: this.lastMutation.guidance || null,
          stranded: !identitiesEqual(this, this.lastMutation) || !this.client,
        }
      : null;
    return {
      generation: this.generation,
      connected: Boolean(this.client && this.project),
      hasClient: Boolean(this.client),
      project: this.project,
      events: this.events,
      nextCursor: this.nextCursor,
      retainedCursor: this.retainedCursor,
      windowTruncated: this.windowTruncated,
      loadMoreEnabled: this.loadMoreEnabled,
      lastMutation: mutation,
      busy: { ...this.#busy },
      baseUrl: this.baseUrl,
      projectId: this.projectId,
      fixture: Boolean(this.fixture),
      status: this.status,
      canReconcile: Boolean(
        mutation &&
          mutation.state === "unknown" &&
          mutation.body &&
          this.client &&
          identitiesEqual(this, mutation),
      ),
      originLabel: this.fixture ? "Synthetic fixture · no network" : this.baseUrl,
      actionLocked: Object.values(this.#busy).some(Boolean),
    };
  }

  secrets() {
    return [this.token].filter(Boolean);
  }

  #capture() {
    return {
      generation: this.generation,
      client: this.client,
      projectId: this.projectId,
      baseUrl: this.baseUrl,
    };
  }

  #isLive(snapshot) {
    return Boolean(
      snapshot &&
        snapshot.generation === this.generation &&
        snapshot.client === this.client &&
        snapshot.projectId === this.projectId &&
        snapshot.baseUrl === this.baseUrl,
    );
  }

  #publicMessage(error) {
    const text = error && error.message ? error.message : "The request could not be completed.";
    return redactString(text, collectSecrets(...this.secrets()));
  }

  #fail(code, message, tone = "danger") {
    this.status = { tone, message };
    return { ok: false, code, message };
  }

  #unresolvedMutation() {
    const mutation = this.lastMutation;
    if (!mutation) return null;
    if (mutation.state === "pending" || mutation.state === "unknown") return mutation;
    return null;
  }

  #beginGeneration({ preserveUnknown = true } = {}) {
    const retained = preserveUnknown ? this.#unresolvedMutation() : null;
    if (retained) {
      retained.state = "unknown";
      retained.guidance = retained.guidance || DISCONNECT_GUIDANCE;
    }
    this.client?.dispose?.();
    this.generation += 1;
    this.token = null;
    this.client = null;
    this.fixture = null;
    this.project = null;
    this.events = [];
    this.nextCursor = null;
    this.retainedCursor = null;
    this.windowTruncated = false;
    this.loadMoreEnabled = false;
    this.#busy = emptyBusy();
    this.lastMutation = retained;
    return retained;
  }

  dispose({ preserveUnknown = false } = {}) {
    this.#beginGeneration({ preserveUnknown });
    if (!preserveUnknown) this.lastMutation = null;
    this.projectId = "";
    this.baseUrl = "";
    this.status = {
      tone: "note",
      message: "Disconnected. The grant was not kept in this page.",
    };
  }

  disconnect(message) {
    const retained = this.#beginGeneration({ preserveUnknown: true });
    if (retained) {
      retained.guidance = DISCONNECT_GUIDANCE;
    }
    this.status = {
      tone: "note",
      message: message || "Disconnected. Enter the grant again to continue; it was not stored.",
    };
    return { ok: true };
  }

  #applyPage(page, after) {
    const incoming = Array.isArray(page?.events) ? page.events : [];
    const merged = after
      ? mergeEventWindow(this.events, incoming, WINDOW_EVENT_LIMIT)
      : mergeEventWindow([], incoming, WINDOW_EVENT_LIMIT);
    this.events = merged.events;
    this.windowTruncated = after ? this.windowTruncated || merged.truncated : merged.truncated;
    this.nextCursor = page?.nextCursor ?? null;
    if (incoming.length) this.retainedCursor = page?.nextCursor ?? this.retainedCursor;
    else if (after) this.retainedCursor = page?.nextCursor ?? after;
    this.loadMoreEnabled = Boolean(incoming.length && page?.nextCursor);
  }

  #mergeEvents(incoming) {
    const merged = mergeEventWindow(this.events, incoming, WINDOW_EVENT_LIMIT);
    this.events = merged.events;
    this.windowTruncated = this.windowTruncated || merged.truncated;
  }

  #handleConnectError(error) {
    this.#beginGeneration({ preserveUnknown: true });
    if (error && error.status === 401) {
      return this.#fail(
        "revoked",
        "The grant is invalid, expired, or revoked. Request a new project-scoped token from the project owner.",
      );
    }
    if (error && (error.code === "unavailable" || error.status == null)) {
      return this.#fail(
        "offline",
        "The configured origin did not answer. Email remains the live concierge path.",
      );
    }
    return this.#fail("error", this.#publicMessage(error));
  }

  async connect({ token, projectId, baseUrl, fetchImpl, fixture, after } = {}) {
    if (this.#busy.connect) {
      return this.#fail("busy", "Connect is already in progress.");
    }
    let canonical;
    let id;
    try {
      canonical = assertCorrespondenceOrigin(baseUrl);
      id = validateId(projectId, "projectId");
      if (!token || typeof token !== "string") {
        throw new CorrespondenceError({ message: "grant is required" });
      }
    } catch (error) {
      return this.#fail("invalid", this.#publicMessage(error));
    }

    this.#beginGeneration({ preserveUnknown: true });
    let client;
    try {
      client = new CorrespondenceClient({
        baseUrl: canonical,
        fetch: fetchImpl || globalThis.fetch.bind(globalThis),
        token,
      });
    } catch (error) {
      return this.#fail("invalid", this.#publicMessage(error));
    }
    this.token = token;
    this.projectId = id;
    this.baseUrl = canonical;
    this.fixture = fixture || null;
    this.client = client;
    const captured = this.#capture();
    this.#busy.connect = true;
    try {
      const read = await this.client.getProject({ projectId: id, token });
      if (!this.#isLive(captured)) return { discarded: true };
      this.project = read.project;
      const history = await this.loadHistory({ after, captured });
      if (history?.discarded) return { discarded: true };
      if (history && history.ok === false) return history;
      if (!this.#isLive(captured)) return { discarded: true };
      this.status = {
        tone: "ok",
        message: fixture
          ? "Synthetic fixture connected. This record is not a live correspondence project."
          : "Connected with a project-scoped grant. The token is held only in this page’s memory.",
      };
      return { ok: true };
    } catch (error) {
      if (!this.#isLive(captured)) return { discarded: true };
      return this.#handleConnectError(error);
    } finally {
      if (this.#isLive(captured)) this.#busy.connect = false;
    }
  }

  async loadHistory({ after, captured } = {}) {
    const live = captured || this.#capture();
    if (!this.client) {
      return this.#fail("disconnected", "Connect with a grant before loading history.");
    }
    if (this.#busy.history && !captured) {
      return this.#fail("busy", "History is already loading.");
    }
    const ownsBusy = !captured || !this.#busy.history;
    if (ownsBusy) this.#busy.history = true;
    try {
      const page = await live.client.listEvents({
        projectId: live.projectId,
        after: after || undefined,
        limit: PAGE_EVENT_LIMIT,
        token: this.token,
      });
      if (!this.#isLive(live)) return { discarded: true };
      this.#applyPage(page, after);
      return { ok: true, page };
    } catch (error) {
      if (!this.#isLive(live)) return { discarded: true };
      const kind = classifyError(error);
      if (kind === "revoked") {
        this.#beginGeneration({ preserveUnknown: true });
        return this.#fail(
          "revoked",
          "The grant is invalid, expired, or revoked. Request a new project-scoped token from the project owner.",
        );
      }
      if (kind === "offline") {
        return this.#fail(
          "offline",
          "The configured origin did not answer. Email remains the live concierge path.",
        );
      }
      return this.#fail("error", this.#publicMessage(error));
    } finally {
      if (ownsBusy && this.#isLive(live)) this.#busy.history = false;
    }
  }

  async resume(text) {
    if (this.#busy.resume || this.#busy.history || this.#busy.connect) {
      return this.#fail("busy", "Another session action is already in progress.");
    }
    if (!this.client) {
      return this.#fail(
        "disconnected",
        "Connect with a grant before resuming. A checkpoint never carries the token.",
      );
    }
    this.#busy.resume = true;
    const captured = this.#capture();
    try {
      const parsed = parseCheckpoint(String(text || ""), { secrets: this.secrets() });
      if (!parsed.baseUrl) {
        return this.#fail(
          "invalid",
          "Checkpoint is missing a correspondence origin and cannot be resumed.",
        );
      }
      const origin = assertCorrespondenceOrigin(parsed.baseUrl);
      const sessionOrigin = assertCorrespondenceOrigin(this.baseUrl);
      if (origin !== sessionOrigin || parsed.projectId !== this.projectId) {
        return this.#fail(
          "mismatch",
          "Checkpoint origin and project must match this connection exactly.",
        );
      }
      const result = await this.loadHistory({
        after: parsed.afterCursor || undefined,
        captured,
      });
      if (result.discarded) return result;
      if (!result.ok) return result;
      if (!this.#isLive(captured)) return { discarded: true };
      this.status = {
        tone: "ok",
        message:
          "Resumed from the supplied cursor. The grant was not read from the checkpoint. The checkpoint cannot reconcile an unknown submit.",
      };
      return { ok: true };
    } catch (error) {
      if (!this.#isLive(captured)) return { discarded: true };
      return this.#fail("invalid", this.#publicMessage(error));
    } finally {
      if (this.#isLive(captured)) this.#busy.resume = false;
    }
  }

  async submit(body, { retry = false } = {}) {
    if (!this.client) {
      const unresolved = this.#unresolvedMutation();
      if (unresolved) {
        return this.#fail(
          "stranded",
          unresolved.guidance || DISCONNECT_GUIDANCE,
        );
      }
      return this.#fail("disconnected", "Connect with a grant before submitting.");
    }
    if (this.#busy.submit) {
      return this.#fail("busy", "A submit is already in flight. A replacement key was not minted.");
    }

    const unresolved = this.#unresolvedMutation();
    let key;
    let canonicalBody;
    try {
      canonicalBody = validateEventPost(body);
    } catch (error) {
      return this.#fail("invalid", this.#publicMessage(error));
    }

    if (unresolved) {
      if (!identitiesEqual(this, unresolved)) {
        return this.#fail("stranded", unresolved.guidance || DISCONNECT_GUIDANCE);
      }
      if (canonicalEventBody(canonicalBody) !== canonicalEventBody(unresolved.body)) {
        return this.#fail(
          "unresolved",
          "An unresolved submit is outstanding. Reconcile with the exact same body and Idempotency-Key. A replacement key was not minted.",
        );
      }
      if (unresolved.state === "pending") {
        return this.#fail(
          "busy",
          "The outstanding submit has not settled. A replacement key was not minted.",
        );
      }
      key = unresolved.key;
    } else if (retry) {
      return this.#fail("invalid", "There is no unknown submit to reconcile.");
    } else {
      key = createIdempotencyKey();
    }

    this.lastMutation = {
      key,
      body: canonicalBody,
      state: "pending",
      projectId: this.projectId,
      baseUrl: this.baseUrl,
    };
    const captured = this.#capture();
    const capturedKey = key;
    this.#busy.submit = true;
    try {
      const result = await captured.client.postEvent({
        projectId: captured.projectId,
        token: this.token,
        idempotencyKey: key,
        ...canonicalBody,
      });
      if (!this.#isLive(captured)) return { discarded: true };
      if (!this.lastMutation || this.lastMutation.key !== capturedKey) return { discarded: true };
      this.project = result.project;
      this.lastMutation.state = result.replayed ? "replayed" : "recorded";
      this.lastMutation.guidance = null;
      this.#mergeEvents([result.event]);
      this.status = {
        tone: "ok",
        message: result.replayed
          ? "The server replayed the original event for this Idempotency-Key."
          : "The event was appended to the project record.",
      };
      return { ok: true, result };
    } catch (error) {
      if (!this.#isLive(captured)) return { discarded: true };
      if (!this.lastMutation || this.lastMutation.key !== capturedKey) return { discarded: true };
      const kind = classifyError(error);
      if (kind === "unknown" || kind === "offline") {
        this.lastMutation.state = "unknown";
        this.lastMutation.guidance = DISCONNECT_GUIDANCE;
        this.status = {
          tone: "danger",
          message: `${this.#publicMessage(error)} Do not mint a new Idempotency-Key until this attempt is reconciled.`,
        };
        return { ok: false, code: kind };
      }
      if (kind === "revoked") {
        this.lastMutation.state = "error";
        this.#beginGeneration({ preserveUnknown: true });
        return this.#fail(
          "revoked",
          "The grant was rejected after connect. It may have expired or been revoked. Reconnect with a current token.",
        );
      }
      this.lastMutation.state = kind === "conflict" ? "conflict" : "error";
      return this.#fail(kind, this.#publicMessage(error));
    } finally {
      if (this.#isLive(captured)) this.#busy.submit = false;
    }
  }

  exportCheckpoint() {
    if (!this.project) {
      throw new CorrespondenceError({ message: "connect before exporting a checkpoint" });
    }
    const latest = this.events.length ? this.events[this.events.length - 1] : null;
    return serializeCheckpoint(
      {
        baseUrl: this.baseUrl,
        projectId: this.projectId,
        afterCursor: this.retainedCursor || this.nextCursor,
        lastEventId: latest?.id ?? null,
        lastSequence: latest?.sequence ?? null,
        lastKind: latest?.kind ?? null,
        lastMutation: this.lastMutation
          ? {
              operation: "postEvent",
              idempotencyKey: this.lastMutation.key,
              kind: this.lastMutation.body?.kind,
            }
          : null,
      },
      { secrets: this.secrets() },
    );
  }

  /**
   * Export the retained event window as a record bundle.
   * Truncated or prefix-missing windows are labeled incomplete. Missing events are not invented.
   */
  exportRecordBundle() {
    if (!this.project) {
      throw new CorrespondenceError({ message: "connect before exporting records" });
    }
    return buildCorrespondenceRecordBundle({
      baseUrl: this.baseUrl,
      project: this.project,
      events: this.events,
      nextCursor: this.nextCursor,
      truncated: this.windowTruncated === true,
      secrets: this.secrets(),
    });
  }
}
