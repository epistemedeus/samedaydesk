import { buildReproducer, negotiate, ENVELOPE, type Disclosure, type Mode, type Permission } from '../src/index.mjs';
const disclosure: Disclosure = { actionability: 'unknown', rights: { status: 'unknown', ref: null }, funding: { kind: 'unknown', ref: null }, cost: null, termsVersion: null };
const modes: Mode[] = ['report-gap', 'maintain-cell'];
const permission: Permission = { provenance: 'synthetic', authorizationRef: 'fixture:types' };
const result = buildReproducer({ template: { id: 'fixture:one', fields: {} }, sharing: { scope: 'reproducer', ...permission }, input: {} });
negotiate({ accepts: [ENVELOPE], modes }, { disclosure });
void result;
// @ts-expect-error no inferred sharing permission
const invalid: Permission = { provenance: 'inferred', authorizationRef: 'fixture:bad' };
void invalid;
