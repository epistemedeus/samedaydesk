import type { PublicProfile, StoredEntry, ModerationState } from "./types.js";
export type PostState = {
    postId: string;
    taskId: string;
    authorAccountId: string;
    body: string;
    profile: PublicProfile | null;
    audience: "private" | "public";
    publication: {
        text: string;
        profile: PublicProfile;
    } | null;
    moderation: ModerationState;
    removed: boolean;
    everPublished: boolean;
    version: number;
    sequence: number;
    createdAt: string;
    updatedAt: string;
};
export declare function projectDiscussion(taskId: string, entries: StoredEntry[]): Map<string, PostState>;
