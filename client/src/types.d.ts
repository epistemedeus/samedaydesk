// Side-effect-only font packages ship CSS, no TS types.
declare module "@fontsource-variable/inter";
declare module "@fontsource-variable/space-grotesk";
declare module "@fontsource-variable/jetbrains-mono";

declare module "../data/machineEntry.mjs" {
  export function applyMachineMetadata(document: Document, shell: { title: string; description: string; canonical: string }): () => void;
  export const SITE_ORIGIN: string;
  export const GATEWAY_ORIGIN: string;
  export const MERCHANT_REPO: string;
  export const MERCHANT_PIN: string;
  export const MERCHANT_INPUT_PIN: string;
  export const MERCHANT_INPUT_SHORT: string;
  export const CUSTOMER_EXAMPLE_VERSION: string;
  export const RECURRING_MERCHANT_CONTRACTS: {
    readonly C31: {
      readonly label: string;
      readonly reportSchema: string;
      readonly httpProduct: string;
      readonly httpSchema: string;
      readonly route: string;
      readonly health: string;
      readonly openapi: string;
      readonly requiredFields: readonly string[];
    };
    readonly C34: {
      readonly label: string;
      readonly product: string;
      readonly schemaVersion: string;
      readonly skillsIndex: string;
      readonly requiredTopFields: readonly string[];
    };
  };
  export const CUSTOMER_EXAMPLE_DIR: string;
  export const EXPLICIT_RECORD_SKILL: string;
  export const LIVE_INVENTORY: ReadonlyArray<{ readonly label: string; readonly href: string }>;
  export const OBSERVE_QUICKSTART: string;
  export const COMPARE_QUICKSTART: string;
  export const RECORD_QUICKSTART: string;
  export const REUSE_QUICKSTART: string;
  export const RECURRING_QUICKSTART: string;
  export const BUYER_SETUP_QUICKSTART: string;
  export const FOR_AGENTS_PATH: string;
  export const FOR_AGENTS_TITLE: string;
  export const FOR_AGENTS_DESCRIPTION: string;
  export const FOR_AGENTS_CANONICAL: string;
  export const FOR_AGENTS_CRAWLER_HTML: string;
  export const FOR_AGENTS_SHELL: {
    readonly path: string;
    readonly title: string;
    readonly description: string;
    readonly canonical: string;
    readonly crawlerHtml: string;
  };
  export const X402_PATH: string;
  export const X402_TITLE: string;
  export const X402_DESCRIPTION: string;
  export const X402_CANONICAL: string;
  export const X402_CRAWLER_HTML: string;
  export const X402_SHELL: {
    readonly path: string;
    readonly title: string;
    readonly description: string;
    readonly canonical: string;
    readonly crawlerHtml: string;
  };
}
