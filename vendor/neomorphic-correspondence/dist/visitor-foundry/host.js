/** F93 composition hook from neomorphic-io services/correspondence/src/visitor-foundry/host.ts
 * at 107363a0fabaed6133235ebda812dd5f01b07d51, with SDS readiness/close cleanup.
 * Call before createApp, then mount. SQL pins remain unchanged. */
export async function prepareFoundryHost(base, options = {}) {
    const extension = options.enabled === true ? await options.create?.() : undefined;
    if (options.enabled && !extension) {
        throw new Error("enabled foundry requires an explicit installed adapter");
    }
    const ready = base.checkReady?.bind(base);
    const close = base.close.bind(base);
    base.checkReady = async () => {
        await ready?.();
        await extension?.checkReady();
    };
    let closing;
    base.close = () => closing ??= (async () => {
        try {
            await extension?.close();
        } finally {
            await close();
        }
    })();
    try {
        await extension?.checkReady();
    } catch (error) {
        // Retain the readiness error, including if cleanup also fails.
        await base.close().catch(() => {});
        throw error;
    }
    return {
        mount(app) {
            if (extension)
                app.use(extension.router);
        },
    };
}
