export const JOB_ID = "lockfile-pin-delta";
export const DISCOVERY_SCHEMA = "cw69.machine-offer-discovery.v1";
export const IDENTITY_SCHEMA = "cw69.lockfile-pin-delta.identity.v1";
export const DESCRIPTION_SCHEMA = "cw69.machine-offer-description.v1";
export const INVOCATION_SCHEMA = "cw69.machine-offer-invocation.v1";

export const EXPECTED_OUTPUTS = Object.freeze(["pin-delta.json", "pin-delta.md"]);
export const REQUIRED_INPUTS = Object.freeze(["before", "after"]);

export const MERCHANT_VERSION = "1.23.49";
export const STALE_MERCHANT_VERSIONS = Object.freeze(["1.23.45"]);
export const MERCHANT_SERVER_NAME = "io.github.epistemedeus/x402-data-gateway";
export const MERCHANT_HOST = "agents.samedaydesk.com";
export const MERCHANT_ROUTE = "/lockfile-pin-delta";
export const MERCHANT_OPERATION_ID = "compareLockfilePinDelta";
export const MERCHANT_URL = `https://${MERCHANT_HOST}${MERCHANT_ROUTE}`;

export const PUBLIC_ARCHIVE_VERSION = "1.4.1";
export const WRAPPER_ARCHIVE_VERSION = "1.0.0";
export const INTEGRATED_ENGINE_PIN = "5f0f189fd3e88eabfeca2b95b2da644e58374372";
export const PUBLIC_CATALOG_PIN = "fba9d14872bc4c04214e527b9edfb30c2123c9e7";
export const INTEGRATED_BASE = "a9aaa0f8a3bb996948e6033f743b62c4e5417882";
export const M12_COMMIT = "440c2c901329402b6bbaaafa29e1eb0b95dd6f01";
export const M13_COMMIT = "71a7335708669ceb6e460c36dc4eb6625ce7cad4";

export const LOCAL_METHOD = "local-cli";
export const LOCAL_ACQUISITION = "offline-local-run";
export const ALLOWED_METHODS = Object.freeze([LOCAL_METHOD]);
export const ALLOWED_ACQUISITIONS = Object.freeze([LOCAL_ACQUISITION, "free-kit"]);

export const FIXTURE_PRICE_USDC = "0.02";
export const PUBLISHED_ROUTE_PRICE_USDC = "0.005";
export const PUBLISHED_ROUTE_ATOMIC = "5000";
