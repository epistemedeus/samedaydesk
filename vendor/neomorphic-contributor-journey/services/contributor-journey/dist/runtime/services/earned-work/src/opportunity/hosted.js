import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../opportunity-hosted-delivery.mjs");
const hosted = require(modulePath);
export function projectHostedDelivery(input, admission) {
    return hosted.projectHostedDelivery(input, admission);
}
export function projectionForRound(current, roundKey) {
    return hosted.projectionForRound(current, roundKey);
}
export function parseHostedEnv(env) {
    return hosted.parseHostedEnv(env);
}
export function absentHostedDelivery() {
    return hosted.projectHostedDelivery(undefined);
}
//# sourceMappingURL=hosted.js.map