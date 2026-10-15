const text = { type: 'string', minLength: 1, maxLength: 128 };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
export const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const bindingSchema = object({ occurrenceId: text, taskId: text, sourceId: text, sourceDigest: hash, descriptorDigest: hash });
export const assessInputSchema = object({ descriptorDigest: hash });
export const reviewInputSchema = object({ assessmentId: { type: 'string', pattern: '^[a-f0-9-]{36}$' }, assessmentDigest: hash,
  taskId: text, sourceDigest: hash, decision: { enum: ['accept', 'reject'] }, reviewer: text });
export const outputSchema = object({ schema: { const: 'samedaydesk.maintenance-delivery.v1' }, phase: { enum: ['assessment', 'handback'] },
  binding: bindingSchema, disposition: text, acceptance: text, useful: { type: 'boolean' },
  assessment: { type: 'object' }, review: { type: 'object' }, effects: object({ paymentAttempts: { const: 0 }, captures: { const: 0 },
    obligations: { const: 0 }, paidTaskIncrement: { const: 0 }, repairExecutions: { const: 0 } }), digest: hash });
export const descriptorSchema = object({ schema: { const: 'samedaydesk.maintenance-descriptor.v1' }, occurrenceId: text, taskId: text,
  distinctTaskId: text, subject: text, sequence: { type: 'integer', minimum: 2 }, owner: text,
  source: object({ id: text, owner: text, url: { type: 'string', maxLength: 2048 }, expectedDigest: hash }), priorDigest: hash,
  fields: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { enum: ['title', 'description'] } },
  expiry: { type: 'string' }, horizonHours: { type: 'integer', minimum: 1, maximum: 8760 }, optIn: { type: 'boolean' },
  retained: object({ taskId: text, sourceId: text, payloadDigest: hash, entitled: { type: 'boolean' } }) });
export const rightsSchema = object({ schema: { const: 'samedaydesk.maintenance-rights.v1' }, owner: text, sourceId: text, taskId: text,
  revision: text, licensePlane: text, readAllowed: { type: 'boolean' }, reviewAllowed: { type: 'boolean' }, reuseAllowed: { type: 'boolean' },
  mandateState: { enum: ['active', 'revoked'] }, validUntil: { type: 'string' }, expectedReviewer: text });
