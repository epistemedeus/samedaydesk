/** F93 composition hook from neomorphic-io services/correspondence/src/visitor-foundry/host.ts
 * at 107363a0fabaed6133235ebda812dd5f01b07d51. Call before createApp, then mount. */
export async function prepareFoundryHost(base, options = {}) {
    const extension = options.enabled === true ? await options.create?.() : undefined;
    if (options.enabled && !extension) {
        throw new Error("enabled foundry requires an explicit installed adapter");
    }
    if (extension)
        await extension.checkReady();
    const ready = base.checkReady?.bind(base);
    const close = base.close.bind(base);
    base.checkReady = async () => {
        await ready?.();
        await extension?.checkReady();
    };
    base.close = async () => {
        await extension?.close();
        await close();
    };
    return {
        mount(app) {
            if (extension)
                app.use(extension.router);
        },
    };
}
