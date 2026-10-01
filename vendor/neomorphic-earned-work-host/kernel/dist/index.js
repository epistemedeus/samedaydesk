import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { createPostgresStore } from "./store/postgres.js";
import { createConfiguredVerifier } from "./reproduction-verifier.js";
import { drainRuntime } from "./shutdown.js";
export { createApp } from "./app.js";
export { loadConfig, parsePgSchema, parsePoolMax, parseVerifierMode, parseListenHost, listenHostFromEnv, parseShutdownTimeoutMs, } from "./config.js";
export { createConfiguredVerifier, loadReproductionRuntime, REPRODUCTION_VERIFIER_VERSION, boundReproductionSummary, readBoundRuntimeDigest, } from "./reproduction-verifier.js";
export { defaultVerifier, DEFAULT_VERIFIER_VERSION, OWNER_VERIFIER_VERSION } from "./verifier.js";
export { decodeEvidenceBase64, REPRODUCTION_EVIDENCE_MAX_BYTES, REPRODUCTION_EVIDENCE_MEDIA_TYPE, } from "./evidence.js";
export { createPostgresStore, PostgresStore } from "./store/postgres.js";
export { hashEarnedWorkTerms, hashTermsVersion, parseClaimTermsVersion, F17_GOLDEN_TERMS_VERSION } from "./terms-version.js";
export { workabilityForAggregate } from "./work-gate.js";
export { toOwedObligation } from "./obligation.js";
export { reconcilePayout, NULL_PAYOUT_ADAPTER, EMPTY_PAYOUT_NOTE } from "./payout.js";
export { KERNEL_CONTRACT, KERNEL_CONTRACT_ID } from "./contract.js";
export { FORBIDDEN_COMPLETION_LABEL, ARTIFACT_SEMANTICS } from "./honesty.js";
export async function buildStoreFromEnv(env = process.env) {
    const config = loadConfig(env);
    const store = await createPostgresStore(config.databaseUrl, {
        schema: config.pgSchema,
        poolMax: config.poolMax,
    });
    return { store, config };
}
async function main() {
    const { store, config } = await buildStoreFromEnv();
    const app = createApp(store, config, { verifier: createConfiguredVerifier(config) });
    const server = app.listen(config.port, config.listenHost, () => {
        console.log(`earned-work listening on ${config.listenHost}:${config.port} store=${store.kind} trustProxyHops=${config.trustProxyHops}`);
    });
    let shuttingDown = false;
    const shutdown = async () => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        const result = await drainRuntime(server, store, config.shutdownTimeoutMs);
        process.exit(result.forced || result.failed ? 1 : 0);
    };
    process.on("SIGINT", () => {
        void shutdown();
    });
    process.on("SIGTERM", () => {
        void shutdown();
    });
}
const isDirectRun = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map