import { ApiError } from "../errors.js";
import { newId } from "../crypto.js";
import { requireBootstrapReplay } from "../bootstrap-replay.js";
import { applyEventToProject, encodeCursor, projectPublic } from "../project-state.js";
import type {
  ActiveGrant,
  CreateEventInput,
  CreateGrantInput,
  CreateProjectInput,
  EventRecord,
  GrantRecord,
  IdempotencyRecord,
  ListEventsInput,
  Project,
} from "../types.js";
import type {
  CorrespondenceStore,
  CreateEventResult,
  CreateProjectResult,
  ListEventsResult,
} from "./types.js";

type MemoryState = {
  projects: Map<string, Project>;
  grants: Map<string, GrantRecord>;
  events: Map<string, EventRecord[]>;
  idempotency: Map<string, IdempotencyRecord>;
};

function idemKey(scope: string, projectId: string, key: string): string {
  return `${scope}::${projectId}::${key}`;
}

export class MemoryStore implements CorrespondenceStore {
  readonly kind = "memory" as const;
  private readonly state: MemoryState = {
    projects: new Map(),
    grants: new Map(),
    events: new Map(),
    idempotency: new Map(),
  };

  async close(): Promise<void> {}

  async findActiveGrantByTokenHash(tokenHash: string): Promise<ActiveGrant | null> {
    const now = Date.now();
    for (const grant of this.state.grants.values()) {
      if (grant.tokenHash !== tokenHash) continue;
      if (grant.revokedAt) continue;
      if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) continue;
      return {
        id: grant.id,
        projectId: grant.projectId,
        role: grant.role,
        expiresAt: grant.expiresAt,
      };
    }
    return null;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const project = this.state.projects.get(projectId);
    return project ? projectPublic(project) : null;
  }

  async createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
    const existing = this.state.idempotency.get(idemKey("project_create", "", input.idempotencyKey));
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new ApiError(409, "idempotency_conflict", "Idempotency-Key was reused with a different body");
      }
      const body = existing.responseJson as { project: Project; ownerTokenHash: string };
      requireBootstrapReplay(existing.createdAt, body.ownerTokenHash, input.ownerTokenHash);
      return {
        project: body.project,
        ownerToken: input.ownerTokenPlainForReplay,
        replayed: true,
        statusCode: existing.statusCode,
      };
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: newId("prj"),
      title: input.title,
      summary: input.summary,
      status: "open",
      version: 1,
      nextAction: null,
      createdAt: now,
      updatedAt: now,
    };
    const grant: GrantRecord = {
      id: newId("grn"),
      projectId: project.id,
      role: "owner",
      tokenHash: input.ownerTokenHash,
      expiresAt: null,
      revokedAt: null,
      createdAt: now,
    };
    this.state.projects.set(project.id, project);
    this.state.grants.set(grant.id, grant);
    this.state.events.set(project.id, []);

    const response = {
      project: projectPublic(project),
      ownerTokenHash: input.ownerTokenHash,
    };
    this.state.idempotency.set(idemKey("project_create", "", input.idempotencyKey), {
      scope: "project_create",
      projectId: "",
      key: input.idempotencyKey,
      requestHash: input.requestHash,
      statusCode: 201,
      responseJson: response,
      createdAt: now,
    });

    return {
      project: response.project,
      ownerToken: input.ownerTokenPlainForReplay,
      replayed: false,
      statusCode: 201,
    };
  }

  async createGrant(input: CreateGrantInput): Promise<{ grant: GrantRecord; tokenIssuedAt: string }> {
    if (!this.state.projects.has(input.projectId)) {
      throw new ApiError(404, "not_found", "project not found");
    }
    const now = new Date().toISOString();
    const grant: GrantRecord = {
      id: newId("grn"),
      projectId: input.projectId,
      role: input.role,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: now,
    };
    this.state.grants.set(grant.id, grant);
    return { grant, tokenIssuedAt: now };
  }

  async revokeGrant(projectId: string, grantId: string): Promise<"revoked" | "already_revoked"> {
    const grant = this.state.grants.get(grantId);
    if (!grant || grant.projectId !== projectId) {
      throw new ApiError(404, "not_found", "grant not found");
    }
    if (grant.revokedAt) return "already_revoked";
    grant.revokedAt = new Date().toISOString();
    return "revoked";
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const existing = this.state.idempotency.get(
      idemKey("event_create", input.projectId, input.idempotencyKey),
    );
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new ApiError(409, "idempotency_conflict", "Idempotency-Key was reused with a different body");
      }
      const body = existing.responseJson as { event: EventRecord; project: Project };
      return {
        event: body.event,
        project: body.project,
        replayed: true,
        statusCode: existing.statusCode,
      };
    }

    const project = this.state.projects.get(input.projectId);
    if (!project) throw new ApiError(404, "not_found", "project not found");

    const now = new Date().toISOString();
    const nextProject = applyEventToProject(project, input.kind, input.expectedVersion, now);
    const sequence = (this.state.events.get(input.projectId)?.at(-1)?.sequence ?? 0) + 1;
    const event: EventRecord = {
      id: newId("evt"),
      projectId: input.projectId,
      sequence,
      kind: input.kind,
      ...(input.text ? { text: input.text } : {}),
      ...(input.artifact ? { artifact: input.artifact } : {}),
      createdAt: now,
    };

    this.state.projects.set(input.projectId, nextProject);
    const list = this.state.events.get(input.projectId) ?? [];
    list.push(event);
    this.state.events.set(input.projectId, list);

    const response = {
      event,
      project: projectPublic(nextProject),
    };
    this.state.idempotency.set(idemKey("event_create", input.projectId, input.idempotencyKey), {
      scope: "event_create",
      projectId: input.projectId,
      key: input.idempotencyKey,
      requestHash: input.requestHash,
      statusCode: 201,
      responseJson: response,
      createdAt: now,
    });

    return {
      event,
      project: response.project,
      replayed: false,
      statusCode: 201,
    };
  }

  async listEvents(input: ListEventsInput): Promise<ListEventsResult> {
    if (!this.state.projects.has(input.projectId)) {
      throw new ApiError(404, "not_found", "project not found");
    }
    const all = this.state.events.get(input.projectId) ?? [];
    if (input.afterSequence > 0 && !all.some((event) => event.sequence === input.afterSequence)) {
      throw new ApiError(400, "invalid_cursor", "cursor is not valid for this project");
    }
    const filtered = all.filter((event) => event.sequence > input.afterSequence);
    const events = filtered.slice(0, input.limit);
    const last = events.at(-1);
    return {
      events,
      nextCursor: last ? encodeCursor(input.projectId, last.sequence) : null,
    };
  }
}
