/** Directory of packed catalog + per-runtime replay fixtures. */
export const FIXTURE_ROOT: string;

export const STATES: readonly ["discover", "construct", "contract", "authorize-ready", "stop"];
export const RUNTIMES: readonly ["agent402", "coinbase-x402"];
export const CIRCLE_USDC_BASE: string;
export const BASE_NETWORK_LABELS: ReadonlySet<string>;

export const REASONS: {
  readonly FOREIGN_PAY_TO: "foreign_payTo";
  readonly CHANGED_PRICE: "changed_price";
  readonly STALE_TIMESTAMP: "stale_timestamp";
  readonly MISSING_ACCEPTS: "missing_accepts";
};

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
}

export interface CatalogRoute {
  origin: string;
  method: string;
  path: string;
  exampleQuery?: { url?: string };
  exampleUrl?: string;
  operationId?: string;
  product?: string;
  mcpPriceUsd?: string;
}

export interface CatalogContract {
  x402Version?: number;
  scheme?: string;
  network?: string;
  payTo?: string;
  asset?: string;
  amount?: string;
  maxAmountRequired?: string;
  priceUsd?: number;
  decimals?: number;
  extra?: { name?: string; version?: string; decimals?: number };
  outputGuaranteedPaths?: string[];
  [key: string]: unknown;
}

export interface CatalogDocument {
  route: CatalogRoute;
  contract: CatalogContract;
  volatileOmitted?: string[];
  definitions?: Record<string, unknown>;
  now?: number | string;
  maxAgeSeconds?: number;
  [key: string]: unknown;
}

export interface RuntimeFixtures {
  name: string;
  dir: string;
  sources: object;
  states: Record<string, object>;
}

export interface PaymentAccept {
  scheme?: string;
  network?: string;
  payTo?: string;
  asset?: string;
  amount?: string;
  maxAmountRequired?: string;
  extra?: { name?: string; version?: string; decimals?: number };
  [key: string]: unknown;
}

export interface PaymentRequiredBody {
  x402Version?: number;
  accepts?: PaymentAccept[];
  resource?: { url?: string; mimeType?: string; serviceName?: string };
  extensions?: { bazaar?: Record<string, unknown> };
  lastUpdated?: number | string;
  timestamp?: number | string;
  validUntil?: number | string;
  [key: string]: unknown;
}

export function readJson(path: string): unknown;
export function loadCatalog(): CatalogDocument;
export function loadRuntime(name: string): RuntimeFixtures;
export function listRuntimeDirs(): string[];
export function evmAddr(value: unknown): string;
export function parse402Usd(body: { accepts?: PaymentAccept[] }): number | null;
export function pickPayableAccept(accepts: PaymentAccept[] | undefined, chain?: string): PaymentAccept | null;
export function assertUnpaidRequest(
  request: { method?: string; url?: string; headers?: Record<string, string> },
  assert: { equal: Function; match: Function; doesNotMatch: Function },
): void;
export function collectStrings(value: unknown, into?: string[]): string[];
export function contractFrom402(body: PaymentRequiredBody): {
  x402Version?: number;
  scheme?: string;
  network?: string;
  payTo?: string;
  asset?: string;
  amount?: string;
  maxAmountRequired?: string;
  extraName?: string;
  extraVersion?: string;
  resourceUrl?: string;
  mimeType?: string;
  serviceName?: string;
  exampleKeys: string[];
  guaranteedPaths: string[];
};

/**
 * Compare a 402 body, discovery row, or replay fixture to published evidence.
 * Named reasons: `foreign_payTo`, `changed_price`, `stale_timestamp`, `missing_accepts`.
 */
export function verify(resource: unknown, evidence: unknown): VerifyResult;
