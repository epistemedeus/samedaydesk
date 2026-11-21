const SCHEMA = 'cc0.query-key-caller.v4';
const PRIVATE_KEYS = new Set([
  'requesterid', 'contributorid', 'accountid', 'amount', 'reward', 'evidence', 'review',
  'reason', 'password', 'cookie', 'secret', 'payout', 'tenantid', 'origin',
]);
const TOP_KEYS = new Set(['schema', 'left', 'right']);
const SIDE_KEYS = new Set(['method', 'path', 'pairs']);
const PAIR_KEYS = new Set(['key', 'form', 'value']);

export function refuse(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function ownKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('unknown_key_refused');
  return Object.keys(value);
}

function screenKeys(value, allowed) {
  for (const key of ownKeys(value)) {
    if (PRIVATE_KEYS.has(key.toLowerCase())) refuse('private_field_refused');
    if (!allowed.has(key)) refuse('unknown_key_refused');
  }
}

function screenSide(side) {
  screenKeys(side, SIDE_KEYS);
  if (typeof side.method !== 'string' || typeof side.path !== 'string' || !Array.isArray(side.pairs)) {
    refuse('unknown_key_refused');
  }
  for (const pair of side.pairs) {
    screenKeys(pair, PAIR_KEYS);
    if (typeof pair.key !== 'string' || typeof pair.form !== 'string') refuse('unknown_key_refused');
    if (pair.form === 'value') {
      if (typeof pair.value !== 'string' || pair.value.length === 0) refuse('unknown_key_refused');
    } else if (pair.form === 'bare' || pair.form === 'blank') {
      if (Object.hasOwn(pair, 'value')) refuse('unknown_key_refused');
    } else {
      refuse('unknown_key_refused');
    }
  }
}

export function screenCaller(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) refuse('unknown_schema');
  if (document.schema !== SCHEMA) refuse('unknown_schema');
  screenKeys(document, TOP_KEYS);
  if (!Object.hasOwn(document, 'left') || !Object.hasOwn(document, 'right')) refuse('unknown_key_refused');
  screenSide(document.left);
  screenSide(document.right);
  return document;
}

export function prepareReturn(document, hooks) {
  screenCaller(document);
  const artifactDigest = hooks.digest(document);
  if (hooks.apply) hooks.apply(document);
  return {document, artifactDigest};
}
