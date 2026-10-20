import { ApiError } from "./errors.js";
export function applyEventToProject(project, kind, expectedVersion, now) {
    if (kind === "resolved" || kind === "reopened") {
        if (expectedVersion == null) {
            throw new ApiError(400, "invalid_input", "expectedVersion is required for resolved and reopened events");
        }
        if (expectedVersion !== project.version) {
            throw new ApiError(409, "version_conflict", "expectedVersion does not match the current project version");
        }
    }
    let status = project.status;
    let version = project.version;
    let nextAction = project.nextAction;
    switch (kind) {
        case "request":
            if (status === "resolved") {
                throw new ApiError(409, "conflict", "resolved projects must be reopened before new requests");
            }
            nextAction = { kind: "reply" };
            break;
        case "reply":
        case "artifact":
        case "correction":
            if (status === "resolved") {
                throw new ApiError(409, "conflict", "resolved projects must be reopened before new events");
            }
            if (kind === "reply" && nextAction?.kind === "reply") {
                nextAction = null;
            }
            break;
        case "needs_human":
            if (status === "resolved") {
                throw new ApiError(409, "conflict", "resolved projects must be reopened before needs_human");
            }
            status = "needs_human";
            nextAction = { kind: "human_review" };
            break;
        case "resolved":
            status = "resolved";
            version += 1;
            nextAction = null;
            break;
        case "reopened":
            status = "open";
            version += 1;
            nextAction = null;
            break;
        default:
            break;
    }
    return {
        ...project,
        status,
        version,
        nextAction,
        updatedAt: now,
    };
}
export function encodeCursor(projectId, sequence) {
    return Buffer.from(JSON.stringify([projectId, sequence])).toString("base64url");
}
export function projectPublic(project) {
    return {
        id: project.id,
        title: project.title,
        summary: project.summary,
        status: project.status,
        version: project.version,
        nextAction: project.nextAction,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}
//# sourceMappingURL=project-state.js.map