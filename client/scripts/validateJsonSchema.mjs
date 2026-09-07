export function validateJsonSchema(value, schema, path = "$") {
  return check(value, schema, path, schema);
}

function resolve(schema, root) {
  if (!schema.$ref) return schema;
  const prefix = "#/$defs/";
  if (!schema.$ref.startsWith(prefix)) {
    throw new Error(`unsupported $ref ${schema.$ref}`);
  }
  const name = schema.$ref.slice(prefix.length);
  const resolved = root.$defs?.[name];
  if (!resolved) throw new Error(`missing $defs ${name}`);
  return resolved;
}

function typesOf(schema) {
  if (!schema.type) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function jsType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function check(value, rawSchema, path, root) {
  const schema = resolve(rawSchema, root);
  const errors = [];
  const allowed = typesOf(schema);
  if (allowed.length && !allowed.includes(jsType(value))) {
    errors.push(`${path}: expected ${allowed.join("|")}, got ${jsType(value)}`);
    return errors;
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(", ")}`);
  }
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: failed pattern ${schema.pattern}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) {
      errors.push(`${path}: fewer than ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...check(item, schema.items, `${path}[${index}]`, root));
      });
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}: missing ${key}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties[key]) errors.push(`${path}: unexpected ${key}`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...check(value[key], child, `${path}.${key}`, root));
      }
    }
  }
  return errors;
}
