/** Host-owned assertions, not grants or automatically verified rights. */
export type Permission = Readonly<{ provenance: 'synthetic' | 'authorized'; authorizationRef: string }>;
export type Mode = 'report-gap' | 'counterexample' | 'adapt-artifact' | 'maintain-cell';
export type Operation = 'create' | 'claim' | 'checkpoint' | 'submit';
export type Condition = 'resolved' | 'unknown' | 'auth-failure' | 'temporary-outage' | 'quota-pressure';
export type Status = Exclude<Condition, 'resolved'> | 'known-hit' | 'genuine-miss' | 'incomplete-coverage' | 'declined';
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type Artifact = Readonly<{ uri: string; digest: string }>;
export type Disclosure = Readonly<{
  actionability: 'actionable' | 'not-actionable' | 'unknown';
  rights: { status: 'allowed' | 'denied' | 'unknown'; ref: string | null };
  funding: { kind: 'voluntary' | 'unfunded-request' | 'funded' | 'unknown'; ref: string | null };
  cost: { units: number; currency: string } | null;
  termsVersion: string | null;
}>;
export type Negotiation = { accepts?: string[]; modes?: Mode[]; budgetSeconds?: number };
export type Envelope = Disclosure & Readonly<{
  schema: 'neomorphic.foundry.participation.v1'; status: Status; optional: true;
  originalAccess: 'unconditional'; modes: readonly Mode[]; costKnown: boolean;
  authority: 'host-owned'; contributionState: 'not-started';
}>;
declare const hostAssessment: unique symbol;
export type Assessment = Readonly<{ [hostAssessment]: true; status: Status; gap: JSONValue | null; selected: JSONValue | null }>;
export type ResolverRequest = {
  schema: 'neomorphic.foundry.capability-request.v1'; taskId: string; outcome: string;
  input: JSONValue; environment: Record<string, string | number | boolean>; output: JSONValue | null; capabilityId: string | null;
};
export function assessVF01(context: {
  snapshot: unknown; request: ResolverRequest; permission: Permission;
  options: { now: string; policy?: { policyRef: string; admittedObservationIds: string[] } };
  gap?: { gapId: string; reproducer: { ref: string; permission: 'synthetic' | 'authorized' }; funding: { kind: 'voluntary' | 'unfunded-request' | 'funded'; ref: string | null } };
}): Assessment;
export type HostContext = { disclosure: Disclosure; condition?: Condition; assessment?: Assessment };
export const ENVELOPE: 'neomorphic.foundry.participation.v1';
export const MODES: readonly Mode[];
export function facts(raw: Disclosure): Disclosure;
export function negotiate(negotiation: Negotiation | undefined, context: HostContext): Envelope | null;
export function conditionFromHttp(status: number): Exclude<Condition, 'resolved'>;
export function decline<T>(original: T, envelope?: Envelope | null): { original: T; participation: Envelope & { status: 'declined' } };
export function jsonBoundary<T>(original: T, negotiation: Negotiation, context: HostContext): T | { original: T; participation: Envelope };
export function httpBoundary<T>(response: T, negotiation: Negotiation, context: HostContext): { response: T; participation: Envelope | null };
export function toolBoundary<T>(result: T, negotiation: Negotiation, context: HostContext): T | { schema: 'neomorphic.foundry.participation-tool-result.v1'; result: T; participation: Envelope };
export function cliBoundary<T>(original: T, negotiation: Negotiation, context: HostContext): { original: T; participation: Envelope | null };
export function parseNegotiation(raw: unknown): Negotiation;
export const negotiationExample: Negotiation;
export type FieldRule = { type: 'string' | 'integer' | 'boolean'; maxLength: number } | { type: 'object'; fields: Record<string, FieldRule> } | { type: 'array'; maxItems: number; items: FieldRule };
export type Template = { id: string; fields: Record<string, FieldRule> };
export type Reproducer = Readonly<{ schema: 'neomorphic.foundry.participation-reproducer.v1'; templateId: string; scope: 'metadata' | 'reproducer'; provenance: 'synthetic' | 'authorized' | null; authorizationRef: string | null; fields: Record<string, JSONValue> | null }>;
export function buildReproducer(input: { template: Template; sharing?: { scope: 'metadata' } | ({ scope: 'reproducer' } & Permission); input?: unknown }): Reproducer;
export function semanticIdentity(input: { tenantId: string; identityKey: string; proposal: JSONValue | Reproducer }): string;
export function sharingBytes(reproducer: Reproducer): number;
export type Binding = Readonly<{ origin: string; tenantId: string; grantFingerprint: string }>;
export type Intent = Readonly<{ schema: 'neomorphic.foundry.participation-intent.v1'; binding: Binding; mode: Mode; operation: Operation; cellId: string | null; termsVersion: string; body: JSONValue; requestId: string; seal: string }>;
export type Hint = Readonly<{ schema: 'neomorphic.foundry.participation-hint.v1'; cellId: string }>;
export type PortInput = { cellId: string | null; requestId: string; termsVersion: string; body: JSONValue };
export type HostMethods = Record<Operation, (input: PortInput) => Promise<unknown>> & { read(input: { cellId: string }): Promise<unknown> };
export type Port = HostMethods & { validate(operation: Operation, body: JSONValue): void };
export type Outcome = { status: string; requestId?: string; reconciling?: boolean; receipt?: unknown; current?: unknown; nextStep?: string; authority?: string };
export class ParticipationSession {
  constructor(config: { identityKey: string; binding: Binding; port: Port; currentTerms(input: { cellId: string | null; operation: Operation }): Promise<string> });
  prepare(input: { mode: Mode; operation: Operation; cellId?: string | null; termsVersion: string; body: JSONValue; consent: true }): Intent;
  execute(intent: Intent): Promise<Outcome>;
  reconcile(intent: Intent): Promise<Outcome>;
  resume(hint: Hint): Promise<Outcome>;
}
export function continuationHint(cellId: string): Hint;
export function safeOutcome(error: unknown, mutation?: boolean): string;
/** Receiving interface; VF09 implements the injected durable host authority. */
export function vf04Port(host: HostMethods): Port;
export class ParticipationError extends Error { constructor(code: string); code: string; }
