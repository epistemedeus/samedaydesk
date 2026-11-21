import { DiscussionError, idSchema, parseCommand } from "./validation.js";
import { createHash } from "node:crypto";
export function projectDiscussion(taskId, entries) {
    const posts = new Map();
    const operations = new Set();
    let sequence = 0;
    for (const stored of entries) {
        const e = stored.entry;
        if (stored.sequence !== ++sequence || e.taskId !== taskId || operations.has(e.operationId) ||
            !idSchema.safeParse(stored.eventId).success)
            throw new DiscussionError("storage_invalid");
        operations.add(e.operationId);
        let c;
        try {
            c = parseCommand(e.command);
        }
        catch {
            throw new DiscussionError("storage_invalid");
        }
        if (createHash("sha256").update(JSON.stringify(c)).digest("hex") !== e.requestDigest)
            throw new DiscussionError("storage_invalid");
        if (c.kind === "post") {
            if (posts.has(stored.eventId) || (c.audience === "public" && !e.profile))
                throw new DiscussionError("storage_invalid");
            posts.set(stored.eventId, {
                postId: stored.eventId, taskId, authorAccountId: e.actorAccountId, body: c.body,
                profile: e.profile, audience: c.audience ?? "private",
                publication: c.audience === "public" && e.profile ? { text: c.body, profile: e.profile } : null,
                moderation: "pending", removed: false, everPublished: false, version: 1,
                sequence: stored.sequence, createdAt: stored.createdAt, updatedAt: stored.createdAt,
            });
            continue;
        }
        const post = posts.get(c.postId);
        if (!post || post.removed || post.version !== c.expectedVersion ||
            (!["moderate", "report"].includes(c.kind) && e.actorAccountId !== post.authorAccountId)) {
            throw new DiscussionError("storage_invalid");
        }
        if (c.kind === "report")
            continue;
        post.version++;
        post.sequence = stored.sequence;
        post.updatedAt = stored.createdAt;
        switch (c.kind) {
            case "edit":
                post.body = c.body;
                post.audience = "private";
                post.publication = null;
                post.moderation = "pending";
                break;
            case "publish_excerpt":
                if (!e.profile || !post.body.includes(c.text))
                    throw new DiscussionError("storage_invalid");
                post.publication = { text: c.text, profile: e.profile };
                post.moderation = "pending";
                break;
            case "withdraw":
                post.audience = "private";
                post.publication = null;
                break;
            case "remove":
                post.removed = true;
                post.body = "";
                post.publication = null;
                break;
            case "moderate":
                post.moderation = c.decision === "approve" ? "approved" : "hidden";
                if (post.moderation === "approved" && post.publication)
                    post.everPublished = true;
                break;
        }
    }
    return posts;
}
//# sourceMappingURL=projection.js.map