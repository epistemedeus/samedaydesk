import type { EventKind, Project } from "./types.js";
export declare function applyEventToProject(project: Project, kind: EventKind, expectedVersion: number | undefined, now: string): Project;
export declare function encodeCursor(projectId: string, sequence: number): string;
export declare function projectPublic(project: Project): Project;
