/**
 * Offline JSON Schema subset validator.
 * Refuses network $ref / $schema fetches. No npm JSON-Schema library.
 *
 * Supported keywords: type, const, enum, required, properties,
 * additionalProperties, propertyNames, minLength, maxLength, pattern,
 * minItems, maxItems, uniqueItems, items, prefixItems, additionalItems,
 * minimum, maximum, exclusiveMinimum, exclusiveMaximum, minProperties,
 * maxProperties, dependentRequired, allOf, anyOf, oneOf, not, $ref
 * (local #/ only), $defs / definitions, format=uri|uri-reference,
 * boolean schemas.
 */

export function validateJsonSchema(instance, schema, options = {}) {
  const root = options.root ?? schema;
  const errors = [];
  walk(instance, schema, root, '$', errors, 0);
  return { ok: errors.length === 0, errors };
}

function walk(instance, schema, root, path, errors, depth) {
  if (depth > 64) {
    errors.push({ path, message: 'schema recursion limit' });
    return;
  }
  if (schema === true) return;
  if (schema === false) {
    errors.push({ path, message: 'false schema rejects any value' });
    return;
  }
  if (schema == null || typeof schema !== 'object' || Array.isArray(schema)) {
    errors.push({ path, message: 'invalid schema document' });
    return;
  }

  if (schema.$ref) {
    if (typeof schema.$ref !== 'string') {
      errors.push({ path, message: '$ref must be a string' });
      return;
    }
    if (/^https?:\/\//i.test(schema.$ref) || schema.$ref.startsWith('//')) {
      errors.push({
        path,
        message: `refusing network $ref (offline): ${schema.$ref}`,
      });
      return;
    }
    const resolved = resolveRef(schema.$ref, root);
    if (resolved === undefined) {
      errors.push({ path, message: `unresolved local $ref ${schema.$ref}` });
      return;
    }
    walk(instance, resolved, root, path, errors, depth + 1);
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(instance, t))) {
      errors.push({
        path,
        message: `expected type ${types.join('|')}, got ${jsType(instance)}`,
      });
      return;
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    if (!jsonEqual(instance, schema.const)) {
      errors.push({
        path,
        message: `expected const ${JSON.stringify(schema.const)}`,
      });
    }
  }

  if (schema.enum) {
    if (!schema.enum.some((v) => jsonEqual(v, instance))) {
      errors.push({ path, message: `expected enum ${JSON.stringify(schema.enum)}` });
    }
  }

  if (schema.allOf) {
    for (const sub of schema.allOf) walk(instance, sub, root, path, errors, depth + 1);
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((sub) => {
      const inner = [];
      walk(instance, sub, root, path, inner, depth + 1);
      return inner.length === 0;
    });
    if (!ok) errors.push({ path, message: 'anyOf failed' });
  }
  if (schema.oneOf) {
    let matches = 0;
    for (const sub of schema.oneOf) {
      const inner = [];
      walk(instance, sub, root, path, inner, depth + 1);
      if (inner.length === 0) matches += 1;
    }
    if (matches !== 1) {
      errors.push({ path, message: `oneOf matched ${matches} schemas` });
    }
  }
  if (schema.not) {
    const inner = [];
    walk(instance, schema.not, root, path, inner, depth + 1);
    if (inner.length === 0) errors.push({ path, message: 'not: value matched forbidden schema' });
  }

  const t = jsType(instance);

  if (t === 'string') {
    if (schema.minLength !== undefined && [...instance].length < schema.minLength) {
      errors.push({ path, message: `minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && [...instance].length > schema.maxLength) {
      errors.push({ path, message: `maxLength ${schema.maxLength}` });
    }
    if (schema.pattern) {
      let re;
      try {
        re = new RegExp(schema.pattern);
      } catch (e) {
        errors.push({ path, message: `invalid pattern: ${e.message}` });
        re = null;
      }
      if (re && !re.test(instance)) {
        errors.push({ path, message: `pattern /${schema.pattern}/` });
      }
    }
    if (schema.format === 'uri') {
      if (!isHttpUrl(instance)) {
        errors.push({ path, message: 'format uri (http/https URL required)' });
      }
    }
    if (schema.format === 'uri-reference') {
      if (typeof instance !== 'string' || instance.length === 0) {
        errors.push({ path, message: 'format uri-reference' });
      }
    }
  }

  if (t === 'number' || t === 'integer') {
    if (schema.minimum !== undefined && instance < schema.minimum) {
      errors.push({ path, message: `minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && instance > schema.maximum) {
      errors.push({ path, message: `maximum ${schema.maximum}` });
    }
    if (schema.exclusiveMinimum !== undefined && instance <= schema.exclusiveMinimum) {
      errors.push({ path, message: `exclusiveMinimum ${schema.exclusiveMinimum}` });
    }
    if (schema.exclusiveMaximum !== undefined && instance >= schema.exclusiveMaximum) {
      errors.push({ path, message: `exclusiveMaximum ${schema.exclusiveMaximum}` });
    }
  }

  if (t === 'array') {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push({ path, message: `minItems ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push({ path, message: `maxItems ${schema.maxItems}` });
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of instance) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push({ path, message: 'uniqueItems violated' });
          break;
        }
        seen.add(key);
      }
    }
    if (Array.isArray(schema.prefixItems) || Array.isArray(schema.items)) {
      const tuple = schema.prefixItems || schema.items;
      tuple.forEach((sub, i) => {
        if (i < instance.length) {
          walk(instance[i], sub, root, `${path}[${i}]`, errors, depth + 1);
        }
      });
      const rest = Array.isArray(schema.prefixItems) ? schema.items : schema.additionalItems;
      if (rest === false) {
        if (instance.length > tuple.length) {
          errors.push({ path, message: 'additional tuple items forbidden' });
        }
      } else if (rest && typeof rest === 'object') {
        for (let i = tuple.length; i < instance.length; i += 1) {
          walk(instance[i], rest, root, `${path}[${i}]`, errors, depth + 1);
        }
      }
    } else if (schema.items && typeof schema.items === 'object') {
      instance.forEach((item, i) => {
        walk(item, schema.items, root, `${path}[${i}]`, errors, depth + 1);
      });
    }
  }

  if (t === 'object') {
    const keys = Object.keys(instance);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({ path, message: `minProperties ${schema.minProperties}` });
    }
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      errors.push({ path, message: `maxProperties ${schema.maxProperties}` });
    }
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(instance, k)) {
          errors.push({ path, message: `missing required property ${k}` });
        }
      }
    }
    if (schema.dependentRequired && typeof schema.dependentRequired === 'object') {
      for (const [k, deps] of Object.entries(schema.dependentRequired)) {
        if (Object.prototype.hasOwnProperty.call(instance, k)) {
          for (const d of deps) {
            if (!Object.prototype.hasOwnProperty.call(instance, d)) {
              errors.push({ path, message: `dependentRequired ${k} → ${d}` });
            }
          }
        }
      }
    }
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const [k, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(instance, k)) {
        walk(instance[k], sub, root, `${path}.${k}`, errors, depth + 1);
      }
    }
    if (schema.propertyNames) {
      for (const k of keys) {
        walk(k, schema.propertyNames, root, `${path}.propertyName(${k})`, errors, depth + 1);
      }
    }
    const extra = keys.filter((k) => !Object.prototype.hasOwnProperty.call(props, k));
    if (schema.additionalProperties === false && extra.length) {
      errors.push({
        path,
        message: `additional properties not allowed: ${extra.join(', ')}`,
      });
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const k of extra) {
        walk(instance[k], schema.additionalProperties, root, `${path}.${k}`, errors, depth + 1);
      }
    }
  }
}

function matchesType(instance, type) {
  const t = jsType(instance);
  if (type === 'integer') return t === 'integer';
  if (type === 'number') return t === 'number' || t === 'integer';
  return t === type;
}

function jsType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'number';
    return Number.isInteger(v) ? 'integer' : 'number';
  }
  return typeof v;
}

function jsonEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) {
    if (typeof a === 'number' && typeof b === 'number' && a === b) return true;
    return false;
  }
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => jsonEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveRef(ref, root) {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}
