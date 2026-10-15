import { parentPort, workerData } from "node:worker_threads";
import { deltaResult } from "./providers.mjs";
try { parentPort.postMessage({ output: deltaResult(workerData) }); }
catch { parentPort.postMessage({ error: "provider_failed" }); }
