/**
 * SharedTaskWorkspace — thin binding over the existing correspondence service.
 *
 * Shared mode appears only after a real authenticated connection.
 * Unconfigured → local-demo offline export. No second store or protocol.
 */

import {
  CorrespondenceClient,
  createIdempotencyKey,
  assertCorrespondenceOrigin,
} from "../../../../scripts/correspondence/client.mjs";
import { CorrespondenceError } from "../../../../scripts/correspondence/errors.mjs";
import {
  ERROR_CODES,
  LIMITS,
  MODE_LOCAL,
  MODE_SHARED,
  SCHEMA,
} from "./constants.mjs";
import {
  acceptArtifactBody,
  briefEventBody,
  correctEvidenceBody,
  offlineExportPacket,
  packetHistoryHonesty,
  parseExportPacket,
  publishEventBody,
  recordBundleFromExport,
  replayBodiesFromPacket,
  proposeArtifactBody,
} from "./map.mjs";
import { createOfflineWorkspace } from "./offline.mjs";

function workspaceError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function mapServiceError(error) {
  if (error instanceof CorrespondenceError) {
    const code = error.code || ERROR_CODES.unauthorized;
    return workspaceError(code, error.message || String(error), error);
  }
  if (error?.code) return error;
  return workspaceError(ERROR_CODES.invalid_input, error?.message || String(error), error);
}

/**
 * Connect to an existing correspondence origin with a project-scoped grant.
 * Admin token is only used when bootstrapping a new project (owner create).
 */
export async function connectSharedWorkspace({
  baseUrl,
  token,
  projectId = null,
  adminToken = null,
  title = "Shared task workspace",
  summary = "S20 closed-pilot shared task over correspondence.",
  fetchImpl = globalThis.fetch,
  bootstrapIdempotencyKey = null,
} = {}) {
  const origin = assertCorrespondenceOrigin(baseUrl);
  if (!token && !adminToken) {
    throw workspaceError(ERROR_CODES.not_configured, "shared mode requires a grant token or admin bootstrap token");
  }

  const client = new CorrespondenceClient({
    baseUrl: origin,
    fetch: fetchImpl,
    token: token || null,
  });

  let project = null;
  let ownerToken = token || null;
  let grantRole = null;

  if (!projectId && adminToken) {
    const created = await client.createProject({
      idempotencyKey: bootstrapIdempotencyKey || createIdempotencyKey(),
      token: adminToken,
      title: String(title).slice(0, LIMITS.titleMax),
      summary: String(summary).slice(0, LIMITS.summaryMax),
    });
    project = created.project;
    ownerToken = created.ownerToken;
    client.setToken?.(ownerToken);
    // CorrespondenceClient may not expose setToken — recreate with owner token
  }

  const authed = new CorrespondenceClient({
    baseUrl: origin,
    fetch: fetchImpl,
    token: ownerToken,
  });

  if (projectId && !project) {
    const got = await authed.getProject({ projectId, token: ownerToken });
    project = got.project;
  }

  if (!project?.id) {
    throw workspaceError(ERROR_CODES.not_configured, "projectId is required when connecting with an existing grant");
  }

  return createSharedWorkspace({
    client: authed,
    project,
    token: ownerToken,
    adminToken,
    baseUrl: origin,
    fetchImpl,
  });
}

export function createSharedWorkspace({ client, project, token, adminToken = null, baseUrl, fetchImpl }) {
  let current = project;
  let cursor = null;
  const seenIds = new Set();

  async function post(body, { idempotencyKey = null } = {}) {
    try {
      const result = await client.postEvent({
        projectId: current.id,
        token,
        idempotencyKey: idempotencyKey || createIdempotencyKey(),
        ...body,
      });
      current = result.project;
      seenIds.add(result.event.id);
      return result;
    } catch (error) {
      throw mapServiceError(error);
    }
  }

  return {
    mode: MODE_SHARED,
    schema: SCHEMA,
    configured: true,
    get projectId() {
      return current.id;
    },
    get project() {
      return structuredClone(current);
    },
    get baseUrl() {
      return baseUrl;
    },
    get token() {
      return token;
    },

    async createWriterGrant({ expiresAt = null } = {}) {
      if (!token) throw workspaceError(ERROR_CODES.unauthorized, "owner token required to issue grants");
      try {
        return await client.createGrant({
          projectId: current.id,
          token,
          role: "writer",
          ...(expiresAt ? { expiresAt } : {}),
        });
      } catch (error) {
        throw mapServiceError(error);
      }
    },

    async createReaderGrant() {
      try {
        return await client.createGrant({ projectId: current.id, token, role: "reader" });
      } catch (error) {
        throw mapServiceError(error);
      }
    },

    async createTaskBrief(input = {}) {
      const body = briefEventBody(input);
      const result = await post(body, { idempotencyKey: input.idempotencyKey });
      return { event: result.event, project: result.project, mode: MODE_SHARED, replayed: result.replayed };
    },

    async proposeArtifact(input = {}) {
      const body = proposeArtifactBody(input);
      const result = await post(body, { idempotencyKey: input.idempotencyKey });
      return { event: result.event, project: result.project, mode: MODE_SHARED, replayed: result.replayed };
    },

    async acceptArtifact(input = {}) {
      const body = acceptArtifactBody(input);
      const result = await post(body, { idempotencyKey: input.idempotencyKey });
      return { event: result.event, project: result.project, mode: MODE_SHARED, replayed: result.replayed };
    },

    async correctEvidence(input = {}) {
      const body = correctEvidenceBody(input);
      const result = await post(body, { idempotencyKey: input.idempotencyKey });
      return { event: result.event, project: result.project, mode: MODE_SHARED, replayed: result.replayed };
    },

    async publishEvent(input = {}) {
      const body = publishEventBody(input);
      const result = await post(body, { idempotencyKey: input.idempotencyKey });
      return {
        event: result.event,
        project: result.project,
        mode: MODE_SHARED,
        replayed: result.replayed,
        kind: body.kind,
      };
    },

    async listChanges({ after = cursor, limit = LIMITS.pageDefault } = {}) {
      try {
        const page = await client.listEvents({
          projectId: current.id,
          token,
          after: after || undefined,
          limit: Math.min(Math.max(limit, 1), LIMITS.pageMax),
        });
        for (const event of page.events) seenIds.add(event.id);
        if (page.nextCursor) cursor = page.nextCursor;
        return {
          events: page.events,
          nextCursor: page.nextCursor,
          mode: MODE_SHARED,
          projectId: current.id,
        };
      } catch (error) {
        throw mapServiceError(error);
      }
    },

    exportSnapshot() {
      return offlineExportPacket({
        events: [...seenIds].map((id) => ({ id })),
        project: current,
        mode: MODE_SHARED,
      });
    },

    /** Full portable export by walking the cursor from the start. */
    async exportAll({ limit = LIMITS.pageMax, maxEvents = Number.POSITIVE_INFINITY } = {}) {
      const events = [];
      let after = null;
      let truncated = false;
      let nextCursor = null;
      for (;;) {
        const page = await this.listChanges({ after, limit });
        nextCursor = page.nextCursor ?? null;
        if (page.events.length === 0) break;
        const remaining = maxEvents - events.length;
        if (page.events.length > remaining) {
          events.push(...page.events.slice(0, remaining));
          truncated = true;
          break;
        }
        events.push(...page.events);
        if (!page.nextCursor) break;
        after = page.nextCursor;
        if (page.events.length < limit) break;
        if (events.length >= maxEvents) {
          truncated = true;
          break;
        }
      }
      const packet = offlineExportPacket({
        events,
        project: current,
        mode: MODE_SHARED,
        truncated,
        nextCursor: truncated ? nextCursor : null,
      });
      packet.history = packetHistoryHonesty(packet);
      return packet;
    },

    async exportRecordBundle(options = {}) {
      return recordBundleFromExport(await this.exportAll(options));
    },

    /**
     * Replay event bodies from a portable export into this project.
     * New ids/sequences are minted. Missing history is disclosed, not invented.
     */
    async importPacket(packet, { idempotencyPrefix = "import" } = {}) {
      const { parsed, honesty, bodies } = replayBodiesFromPacket(packet);
      if (parsed.project?.id && parsed.project.id !== current.id) {
        // Honest: import copies data into the live project; it does not assume identity.
      }
      const mapping = [];
      for (const [index, item] of bodies.entries()) {
        const importedLine = `importedFromEventId=${item.originalId}`;
        const text = item.body.text ? `${item.body.text}\n${importedLine}` : importedLine;
        const body = {
          ...item.body,
          text: text.slice(0, LIMITS.textMax),
        };
        const rawKey = `${idempotencyPrefix}-${index + 1}-${item.originalId}`;
        const idempotencyKey = (rawKey.length < 8 ? `${rawKey}-padded` : rawKey).slice(0, 200);
        const result = await post(body, { idempotencyKey });
        mapping.push({
          originalId: item.originalId,
          newId: result.event.id,
          kind: result.event.kind,
          replayed: result.replayed,
        });
      }
      return {
        imported: mapping.length,
        skippedLifecycle: parsed.events.length - bodies.length,
        mapping,
        history: honesty,
        sourceProjectId: parsed.project?.id ?? null,
        projectId: current.id,
        mode: MODE_SHARED,
        note: honesty.complete
          ? "Imported event bodies as new correspondence events. Identifiers are not preserved."
          : `${honesty.note} Imported only the supplied event bodies.`,
      };
    },

    asPeer({ peerToken }) {
      if (!peerToken) throw workspaceError(ERROR_CODES.unauthorized, "peer grant token required");
      const peerClient = new CorrespondenceClient({
        baseUrl,
        fetch: fetchImpl,
        token: peerToken,
      });
      return createSharedWorkspace({
        client: peerClient,
        project: current,
        token: peerToken,
        baseUrl,
        fetchImpl,
      });
    },

    dispose() {
      client.dispose?.();
    },
  };
}

/**
 * Factory: unconfigured → offline; with connection options → shared.
 */
export async function openSharedTaskWorkspace(options = {}) {
  if (!options?.baseUrl) {
    return createOfflineWorkspace({ clock: options.clock });
  }
  return connectSharedWorkspace(options);
}

export { createOfflineWorkspace, MODE_LOCAL, MODE_SHARED, SCHEMA };
