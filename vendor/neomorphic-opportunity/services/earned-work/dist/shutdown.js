/** One wall-clock deadline covers the HTTP drain and the database pool drain. */
export async function drainRuntime(server, store, timeoutMs) {
    let timer;
    const drained = (async () => {
        let failed = false;
        try {
            await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
        catch {
            failed = true;
        }
        try {
            await store.close();
        }
        catch {
            failed = true;
        }
        return { forced: false, failed };
    })();
    try {
        return await Promise.race([
            drained,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve({ forced: true, failed: false }), timeoutMs);
            }),
        ]);
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=shutdown.js.map