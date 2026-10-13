import { createHash } from "node:crypto";
import { DiscussionError, entrySchema } from "./validation.js";
export const MAX_THREAD_EVENTS = 5000;
function decode(event, projectId) {
    try {
        if (event.projectId !== projectId || event.kind !== "reply" || event.artifact ||
            !Number.isSafeInteger(event.sequence) || event.sequence < 1 || !event.text ||
            !Number.isFinite(Date.parse(event.createdAt)))
            throw new Error();
        const result = entrySchema.safeParse(JSON.parse(event.text));
        if (!result.success)
            throw new Error();
        return { eventId: event.id, sequence: event.sequence, createdAt: event.createdAt, entry: result.data };
    }
    catch {
        throw new DiscussionError("storage_invalid");
    }
}
/** This is an adapter to the existing event store, not a second message database.
 * Project creation and task->project binding are the integration owner's responsibility. */
export function createCorrespondenceJournal(store, lock) {
    return {
        exclusive: (projectId, action) => lock.run(projectId, action),
        async read(projectId) {
            const entries = [];
            let afterSequence = 0;
            for (;;) {
                const page = await store.listEvents({ projectId, afterSequence, limit: 100 });
                if (!page.events.length)
                    return entries;
                for (const event of page.events) {
                    if (event.sequence !== afterSequence + 1)
                        throw new DiscussionError("storage_invalid");
                    entries.push(decode(event, projectId));
                    afterSequence = event.sequence;
                }
                if (entries.length > MAX_THREAD_EVENTS)
                    throw new DiscussionError("thread_capacity");
            }
        },
        async append(projectId, entry) {
            const text = JSON.stringify(entry);
            if (text.length > 8000 || Buffer.byteLength(text, "utf8") > 24000)
                throw new DiscussionError("invalid_input");
            try {
                const result = await store.createEvent({ projectId, kind: "reply", text,
                    idempotencyKey: `discussion:${entry.operationId}`,
                    requestHash: createHash("sha256").update(text).digest("hex") });
                return decode(result.event, projectId);
            }
            catch (error) {
                if (error instanceof DiscussionError)
                    throw error;
                if (error && typeof error === "object" && "code" in error &&
                    ["idempotency_conflict", "conflict"].includes(String(error.code)))
                    throw new DiscussionError("conflict");
                throw error;
            }
        },
    };
}
/** Fixture only: coordinates one process. Production needs PostgresProjectLock. */
export class FixtureProjectLock {
    tails = new Map();
    async run(projectId, action) {
        const previous = this.tails.get(projectId) ?? Promise.resolve();
        let release;
        const tail = new Promise(resolve => { release = resolve; });
        this.tails.set(projectId, tail);
        await previous;
        try {
            return await action();
        }
        finally {
            release();
            if (this.tails.get(projectId) === tail)
                this.tails.delete(projectId);
        }
    }
}
//# sourceMappingURL=correspondence.js.map