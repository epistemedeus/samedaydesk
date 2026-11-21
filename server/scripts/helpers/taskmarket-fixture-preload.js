// Test subprocesses only. Public qualification keeps the real metadata route.
// Intercept network.info, not task requests or local HTTP protocol checks.
import { withNetworkInfo } from "./taskmarket-fixtures.js";

globalThis.fetch = withNetworkInfo(globalThis.fetch);
