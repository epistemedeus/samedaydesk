import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const modulePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../opportunity-hosted-delivery.mjs",
);

export type HostedConfiguration = "absent" | "malformed" | "wrong_origin" | "out_of_scope" | "hosted";

export type HostedDeliveryProjection = {
  schema: "neomorphic.opportunity-hosted-delivery.v1";
  configuration: HostedConfiguration;
  deliveryState: "unconfigured" | "hosted";
  deploymentRequired: boolean;
  origin: string | null;
  prefix: string | null;
  roundKey: string | null;
  roundReadPath: string | null;
  submissionPathTemplate: string | null;
  readbackPathTemplate: string | null;
  machineClaimPath: string | null;
  waitlistPath: string | null;
  hostedClaimAutomation: false;
  publicClaimable: false;
  publicRemainingSlots: 0;
  publicPaidCapacity: 0;
  anonymousSelfRegistration: false;
  settlementAutomatic: false;
  grantsDelivered: false;
  openInventory: false;
  holderRequired: true;
  claimsRequireScopedHolder: true;
  emailFallback: string;
  note: string;
};

type HostedInput = {
  origin?: string;
  prefix?: string;
  roundKey?: string;
  outOfScope?: boolean;
} | null | undefined;

type HostedModule = {
  projectHostedDelivery(input?: HostedInput, admission?: HostedInput): HostedDeliveryProjection;
  projectionForRound(hosted: HostedDeliveryProjection | null | undefined, roundKey: string): HostedDeliveryProjection;
  parseHostedEnv(env: NodeJS.ProcessEnv): HostedDeliveryProjection;
};

const hosted = require(modulePath) as HostedModule;

export function projectHostedDelivery(input?: HostedInput, admission?: HostedInput): HostedDeliveryProjection {
  return hosted.projectHostedDelivery(input, admission);
}

export function projectionForRound(current: HostedDeliveryProjection, roundKey: string): HostedDeliveryProjection {
  return hosted.projectionForRound(current, roundKey);
}

export function parseHostedEnv(env: NodeJS.ProcessEnv): HostedDeliveryProjection {
  return hosted.parseHostedEnv(env);
}

export function absentHostedDelivery(): HostedDeliveryProjection {
  return hosted.projectHostedDelivery(undefined);
}
