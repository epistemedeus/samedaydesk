/** Opt-in composition hook. Call before createApp to include extension readiness
 * in its existing health check, then mount after the app's transport middleware.
 * No migrations, worker dispatch or listeners are started by this hook. */
export async function prepareFoundryHost(base, options = {}) {
    const extension = options.enabled === true ? await options.create?.() : undefined;
    if (options.enabled && !extension)
        throw new Error("enabled foundry requires an explicit installed adapter");
    const ready = base.checkReady?.bind(base);
    const close = base.close.bind(base);
    let closing;
    base.close = () => closing ??= (async () => {
        try {
            await extension?.close();
        }
        finally {
            await close();
        }
    })();
    try {
        await extension?.checkReady();
    }
    catch (error) {
        try {
            await base.close();
        }
        catch { /* Preserve the original readiness failure. */ }
        throw error;
    }
    base.checkReady = async () => { await ready?.(); await extension?.checkReady(); };
    return { mount(app) { if (extension)
            app.use(extension.router); } };
}
//# sourceMappingURL=host.js.map