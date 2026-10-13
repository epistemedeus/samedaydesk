import { createHash } from "node:crypto";
import { createCursorCodec } from "./cursor.js";
import { MAX_THREAD_EVENTS } from "./correspondence.js";
import { projectDiscussion } from "./projection.js";
import { DiscussionError, idSchema, parseCommand, profileSchema, safeText } from "./validation.js";
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function result(action) {
    try {
        return { ok: true, value: await action() };
    }
    catch (error) {
        // Never echo a submitted body, storage exception, credential or policy detail.
        return { ok: false, error: { code: error instanceof DiscussionError ? error.code : "unavailable" } };
    }
}
function id(value) {
    const parsed = idSchema.safeParse(value);
    if (!parsed.success)
        throw new DiscussionError("invalid_input");
    return parsed.data;
}
export function createDiscussionService(ports) {
    const cursors = createCursorCodec(ports.cursorKey);
    const now = ports.now ?? Date.now;
    function enabled() { if (ports.enabled !== true)
        throw new DiscussionError("disabled"); }
    async function account(credential) {
        const a = await ports.authenticate(credential);
        if (!a || !idSchema.safeParse(a.accountId).success || !idSchema.safeParse(a.sessionId).success ||
            !Number.isFinite(Date.parse(a.authTime)) || !Number.isFinite(Date.parse(a.expiresAt)) ||
            Date.parse(a.authTime) > now() || Date.parse(a.expiresAt) <= now() ||
            Date.parse(a.expiresAt) <= Date.parse(a.authTime))
            throw new DiscussionError("unauthenticated");
        return a;
    }
    function binding(taskId, t) {
        if (!t || t.taskId !== taskId || !idSchema.safeParse(t.projectId).success)
            throw new DiscussionError("not_found");
    }
    async function access(taskId, credential) {
        const a = await account(credential);
        const t = await ports.tasks.forAccount(taskId, a);
        binding(taskId, t);
        if ([t.canRead, t.canPost, t.canModerate, t.publicDiscussionEnabled].some(v => typeof v !== "boolean"))
            throw new DiscussionError("unavailable");
        if (!t.canRead)
            throw new DiscussionError("not_found");
        return { a: { ...a }, t: { ...t } };
    }
    function authorizeCommand(command, t) {
        if ((command.kind === "moderate" && !t.canModerate) ||
            (!["moderate", "withdraw", "remove"].includes(command.kind) && !t.canPost))
            throw new DiscussionError("forbidden");
    }
    async function policy(text, audience) {
        if (!safeText(text, audience) || await ports.contentPolicy.check(text, audience) !== "allow") {
            throw new DiscussionError("refused");
        }
    }
    async function profile(accountId) {
        const p = await ports.profiles.publicProfile(accountId);
        if (!p)
            return null;
        const parsed = profileSchema.safeParse(p);
        if (!parsed.success || !safeText(parsed.data.displayName, "public"))
            throw new DiscussionError("refused");
        await policy(parsed.data.displayName, "public");
        return parsed.data;
    }
    async function publicAuthor(post, expected, snapshot) {
        const current = snapshot?.has(post.authorAccountId) ? snapshot.get(post.authorAccountId) : await profile(post.authorAccountId);
        if (!current || !expected || current.profileId !== expected.profileId ||
            current.visibilityConsentVersion !== expected.visibilityConsentVersion)
            return null;
        return { profileId: current.profileId, displayName: current.displayName };
    }
    async function view(post, viewer, canModerate, snapshot) {
        if (post.removed)
            return viewer || post.everPublished ? { kind: "withdrawn", postId: post.postId, sequence: post.sequence } : null;
        const isAuthor = viewer?.accountId === post.authorAccountId;
        if (!viewer) {
            const publication = post.publication;
            if (post.moderation !== "approved" || !publication)
                return post.everPublished ? { kind: "withdrawn", postId: post.postId, sequence: post.sequence } : null;
            const author = await publicAuthor(post, publication.profile, snapshot);
            if (!author)
                return post.everPublished ? { kind: "withdrawn", postId: post.postId, sequence: post.sequence } : null;
            await policy(publication.text, "public");
            return {
                kind: "post", postId: post.postId, taskId: post.taskId, body: publication.text, author,
                audience: "public", moderation: "approved", version: post.version, sequence: post.sequence,
                createdAt: post.createdAt, updatedAt: post.updatedAt, isAuthor: false, contentTrust: "untrusted_user_text",
            };
        }
        if (!isAuthor && !canModerate && post.moderation !== "approved") {
            // Allow clients that previously saw it to discard their local copy.
            return { kind: "withdrawn", postId: post.postId, sequence: post.sequence };
        }
        await policy(post.body, "private");
        return {
            kind: "post", postId: post.postId, taskId: post.taskId, body: post.body,
            author: await publicAuthor(post, post.profile, snapshot), audience: post.audience, moderation: post.moderation,
            version: post.version, sequence: post.sequence, createdAt: post.createdAt,
            updatedAt: post.updatedAt, isAuthor: !!isAuthor, contentTrust: "untrusted_user_text",
        };
    }
    return {
        write(taskIdInput, credential, key, input) {
            return result(async () => {
                enabled();
                const taskId = id(taskIdInput);
                if (typeof key !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
                    throw new DiscussionError("invalid_input");
                const command = parseCommand(input);
                // Authenticate once before taking a lock, and again inside after any wait.
                const initial = await access(taskId, credential);
                return ports.journal.exclusive(initial.t.projectId, async () => {
                    const { a, t } = await access(taskId, credential);
                    if (t.projectId !== initial.t.projectId || a.accountId !== initial.a.accountId || a.sessionId !== initial.a.sessionId)
                        throw new DiscussionError("conflict");
                    authorizeCommand(command, t);
                    const entries = await ports.journal.read(t.projectId);
                    const posts = projectDiscussion(taskId, entries);
                    const operationId = digest([taskId, a.accountId, key]);
                    const requestDigest = digest(command);
                    const existing = entries.find(e => e.entry.operationId === operationId);
                    let operationEvent = existing;
                    let post;
                    if (existing) {
                        if (existing.entry.requestDigest !== requestDigest)
                            throw new DiscussionError("conflict");
                        const c = existing.entry.command;
                        post = posts.get(c.kind === "post" ? existing.eventId : c.postId);
                    }
                    else {
                        if (entries.length >= MAX_THREAD_EVENTS)
                            throw new DiscussionError("thread_capacity");
                        let p = null;
                        if (command.kind === "post") {
                            await policy(command.body, "private");
                            p = await profile(a.accountId);
                            if (command.audience === "public") {
                                if (!t.publicDiscussionEnabled || !p)
                                    throw new DiscussionError("forbidden");
                                await policy(command.body, "public");
                            }
                        }
                        else {
                            post = posts.get(command.postId);
                            if (!post || post.removed)
                                throw new DiscussionError("not_found");
                            if (!["moderate", "report"].includes(command.kind) && post.authorAccountId !== a.accountId)
                                throw new DiscussionError("not_found");
                            if (command.kind === "report" && post.authorAccountId !== a.accountId && !t.canModerate && post.moderation !== "approved")
                                throw new DiscussionError("not_found");
                            if (post.version !== command.expectedVersion)
                                throw new DiscussionError("conflict");
                            if (command.kind === "edit")
                                await policy(command.body, "private");
                            if (command.kind === "publish_excerpt") {
                                if (!t.publicDiscussionEnabled)
                                    throw new DiscussionError("forbidden");
                                if (!post.body.includes(command.text))
                                    throw new DiscussionError("invalid_input");
                                await policy(command.text, "public");
                                p = await profile(a.accountId);
                                if (!p)
                                    throw new DiscussionError("forbidden");
                            }
                            if (command.kind === "moderate" && command.decision === "approve") {
                                await policy(post.body, "private");
                                if (post.publication) {
                                    if (!t.publicDiscussionEnabled || !await publicAuthor(post, post.publication.profile))
                                        throw new DiscussionError("forbidden");
                                    await policy(post.publication.text, "public");
                                }
                            }
                        }
                        const entry = { schema: "contributor-discussion-v1", taskId,
                            actorAccountId: a.accountId, operationId, requestDigest, command, profile: p };
                        const finalAuthority = await access(taskId, credential);
                        if (finalAuthority.a.accountId !== a.accountId || finalAuthority.a.sessionId !== a.sessionId || finalAuthority.t.projectId !== t.projectId)
                            throw new DiscussionError("conflict");
                        authorizeCommand(command, finalAuthority.t);
                        if ((command.kind === "publish_excerpt" || (command.kind === "post" && command.audience === "public")) && !finalAuthority.t.publicDiscussionEnabled)
                            throw new DiscussionError("forbidden");
                        const stored = await ports.journal.append(t.projectId, entry);
                        // Replay authoritative storage, including if append returned a replay.
                        const readback = await ports.journal.read(t.projectId);
                        const found = readback.find(e => e.eventId === stored.eventId && e.entry.operationId === operationId && e.entry.requestDigest === requestDigest);
                        if (!found)
                            throw new DiscussionError("storage_invalid");
                        operationEvent = found;
                        const projected = projectDiscussion(taskId, readback);
                        post = projected.get(command.kind === "post" ? stored.eventId : command.postId);
                    }
                    if (!post || !operationEvent)
                        throw new DiscussionError("storage_invalid");
                    const current = await view(post, a, t.canModerate);
                    if (!current)
                        throw new DiscussionError("storage_invalid");
                    return { postId: post.postId, eventId: operationEvent.eventId, operationSequence: operationEvent.sequence,
                        sequence: post.sequence, version: post.version, replayed: !!existing, post: current };
                });
            });
        },
        /** Latest projections ordered by latest change, not raw immutable message history.
         * Consumers upsert by postId and remove tombstones. Poll from returned cursor. */
        list(taskIdInput, credential, input = {}) {
            return result(async () => {
                enabled();
                const taskId = id(taskIdInput);
                const limit = input.limit ?? 25;
                if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)
                    throw new DiscussionError("invalid_input");
                let a = null;
                let t;
                if (credential !== null) {
                    const accessResult = await access(taskId, credential);
                    a = accessResult.a;
                    t = accessResult.t;
                }
                else {
                    const publicTask = await ports.tasks.forPublic(taskId);
                    binding(taskId, publicTask);
                    if (publicTask.publicDiscussionEnabled !== true)
                        throw new DiscussionError("not_found");
                    t = publicTask;
                }
                const scope = JSON.stringify([taskId, t.projectId, a ? ["account", a.accountId] : ["public"]]);
                const checkpoint = cursors.decode(scope, input.cursor);
                return ports.journal.exclusive(t.projectId, async () => {
                    // No private authority survives a queued lock or session revocation.
                    if (a) {
                        const fresh = await access(taskId, credential);
                        if (fresh.a.accountId !== a.accountId || fresh.a.sessionId !== a.sessionId || fresh.t.projectId !== t.projectId)
                            throw new DiscussionError("conflict");
                        t = fresh.t;
                        a = fresh.a;
                    }
                    else {
                        const fresh = await ports.tasks.forPublic(taskId);
                        if (!fresh || fresh.publicDiscussionEnabled !== true || fresh.taskId !== taskId || fresh.projectId !== t.projectId)
                            throw new DiscussionError("not_found");
                    }
                    const entries = await ports.journal.read(t.projectId);
                    if (!a && entries.length >= MAX_THREAD_EVENTS)
                        throw new DiscussionError("thread_capacity");
                    const end = entries.at(-1)?.sequence ?? 0;
                    if (checkpoint.sequence > end)
                        throw new DiscussionError("invalid_cursor");
                    // Full projection first: old cursors cannot resurrect edited/withdrawn text.
                    const posts = [...projectDiscussion(taskId, entries).values()].sort((x, y) => x.sequence - y.sequence);
                    // Profile withdrawal is external to the discussion log. Invalidate public
                    // checkpoints so a resumed consumer clears previously visible text too.
                    const profileSnapshot = new Map();
                    for (const post of posts) {
                        if ((a || post.everPublished) && !profileSnapshot.has(post.authorAccountId)) {
                            profileSnapshot.set(post.authorAccountId, await profile(post.authorAccountId));
                        }
                    }
                    // A policy update can discover a secret without a new journal event.
                    // Revalidate visible text even when the reader's cursor is caught up.
                    for (const post of posts) {
                        if (post.removed)
                            continue;
                        if (a && (post.authorAccountId === a.accountId || t.canModerate || post.moderation === "approved"))
                            await policy(post.body, "private");
                        if (!a && post.moderation === "approved" && post.publication && await publicAuthor(post, post.publication.profile, profileSnapshot))
                            await policy(post.publication.text, "public");
                    }
                    const visibility = digest([a ? ["private", !!t.canModerate] : "public",
                        [...profileSnapshot.entries()].sort(([x], [y]) => x.localeCompare(y))]);
                    const reset = checkpoint.visibility !== visibility;
                    const after = reset ? 0 : checkpoint.sequence;
                    const items = [];
                    let position = after;
                    let hasMore = false;
                    for (const post of posts) {
                        if (post.sequence <= after)
                            continue;
                        const item = await view(post, a, !!t.canModerate, profileSnapshot);
                        if (item && items.length === limit) {
                            hasMore = true;
                            break;
                        }
                        position = post.sequence;
                        if (item)
                            items.push(item);
                    }
                    if (!hasMore)
                        position = end;
                    return { items, cursor: cursors.encode(scope, position, visibility), hasMore, reset };
                });
            });
        },
        reports(taskIdInput, credential, input = {}) {
            return result(async () => {
                enabled();
                const taskId = id(taskIdInput);
                const limit = input.limit ?? 25;
                if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)
                    throw new DiscussionError("invalid_input");
                const initial = await access(taskId, credential);
                if (!initial.t.canModerate)
                    throw new DiscussionError("forbidden");
                const scope = JSON.stringify(["reports", taskId, initial.t.projectId, initial.a.accountId]);
                const checkpoint = cursors.decode(scope, input.cursor);
                return ports.journal.exclusive(initial.t.projectId, async () => {
                    const fresh = await access(taskId, credential);
                    if (!fresh.t.canModerate)
                        throw new DiscussionError("forbidden");
                    if (fresh.t.projectId !== initial.t.projectId || fresh.a.accountId !== initial.a.accountId || fresh.a.sessionId !== initial.a.sessionId)
                        throw new DiscussionError("conflict");
                    const entries = await ports.journal.read(fresh.t.projectId);
                    projectDiscussion(taskId, entries);
                    const end = entries.at(-1)?.sequence ?? 0;
                    if (checkpoint.sequence > end)
                        throw new DiscussionError("invalid_cursor");
                    const reports = entries.filter(e => e.sequence > checkpoint.sequence && e.entry.command.kind === "report");
                    const items = reports.slice(0, limit).map(e => {
                        const command = e.entry.command;
                        if (command.kind !== "report")
                            throw new DiscussionError("storage_invalid");
                        return { reportId: e.eventId, postId: command.postId, reason: command.reason, sequence: e.sequence, createdAt: e.createdAt };
                    });
                    const hasMore = reports.length > limit;
                    const position = hasMore ? items.at(-1).sequence : end;
                    return { items, cursor: cursors.encode(scope, position, "reports"), hasMore };
                });
            });
        },
    };
}
//# sourceMappingURL=service.js.map