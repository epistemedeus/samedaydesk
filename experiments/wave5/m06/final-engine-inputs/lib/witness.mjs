export function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pointerTokens(pointer) {
  if (pointer === "") return { ok: true, tokens: [] };
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    return { ok: false, tokens: [] };
  }
  return {
    ok: true,
    tokens: pointer
      .slice(1)
      .split("/")
      .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~")),
  };
}

export function getAtPointer(doc, pointer) {
  const parsed = pointerTokens(pointer);
  if (!parsed.ok) return { present: false, invalid: true };
  let cur = doc;
  for (const token of parsed.tokens) {
    if (cur === null || typeof cur !== "object") return { present: false };
    if (!Object.prototype.hasOwnProperty.call(cur, token)) return { present: false };
    cur = cur[token];
  }
  return { present: true, value: cur };
}

function pointerFromLocalRef(ref) {
  if (typeof ref !== "string" || !ref.startsWith("#")) return null;
  const hash = ref.slice(1);
  return hash === "" ? "" : hash;
}

function typeList(schema) {
  if (typeof schema.type === "string") return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.filter((item) => typeof item === "string");
  return [];
}

function typeOk(instance, schema) {
  if (instance === null && schema.nullable === true) return true;
  const allowed = typeList(schema);
  if (!allowed.length) return true;
  const got = jsonType(instance);
  if (allowed.includes(got)) return true;
  if (got === "number" && Number.isInteger(instance) && allowed.includes("integer")) return true;
  return false;
}

function apply(instance, schema, root, stack) {
  if (schema === true) return [];
  if (schema === false) return [{ message: "false schema" }];
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return [{ message: "unsupported schema node" }];
  }

  if (typeof schema.$ref === "string") {
    if (!schema.$ref.startsWith("#")) return [{ message: "remote $ref" }];
    if (stack.includes(schema.$ref)) return [{ message: "cyclic $ref" }];
    const pointer = pointerFromLocalRef(schema.$ref);
    const hit = getAtPointer(root, pointer);
    if (!hit.present) return [{ message: `unresolved $ref ${schema.$ref}` }];
    const errors = apply(instance, hit.value, root, [...stack, schema.$ref]);
    const siblings = { ...schema };
    delete siblings.$ref;
    delete siblings.$schema;
    delete siblings.$id;
    delete siblings.$comment;
    delete siblings.title;
    delete siblings.description;
    delete siblings.$defs;
    delete siblings.definitions;
    if (Object.keys(siblings).length) {
      errors.push(...applyKeywords(instance, siblings, root, stack));
    }
    return errors;
  }

  return applyKeywords(instance, schema, root, stack);
}

function applyKeywords(instance, schema, root, stack) {
  const errors = [];
  if (!typeOk(instance, schema)) {
    return [{ message: `type ${typeList(schema).join("|")} got ${jsonType(instance)}` }];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, instance))) {
    errors.push({ message: "enum mismatch" });
  }
  if (typeof instance === "string" && typeof schema.minLength === "number" && instance.length < schema.minLength) {
    errors.push({ message: `minLength ${schema.minLength}` });
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      errors.push(...apply(instance, sub, root, stack));
    }
  }
  if (Array.isArray(instance) && Array.isArray(schema.prefixItems)) {
    for (const [index, sub] of schema.prefixItems.entries()) {
      if (index >= instance.length) break;
      errors.push(...apply(instance[index], sub, root, stack));
    }
  }
  if (Array.isArray(instance) && Object.prototype.hasOwnProperty.call(schema, "items")) {
    for (const [index, item] of instance.entries()) {
      if (Array.isArray(schema.prefixItems) && index < schema.prefixItems.length) continue;
      errors.push(...apply(item, schema.items, root, stack));
    }
  }
  if (instance && typeof instance === "object" && !Array.isArray(instance)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(instance, key)) {
        errors.push({ message: `missing ${key}` });
      }
    }
    const properties =
      schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
        ? schema.properties
        : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(instance, key)) continue;
      errors.push(...apply(instance[key], childSchema, root, stack));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(instance)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push({ message: `unexpected ${key}` });
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(instance)) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
        errors.push(...apply(instance[key], schema.additionalProperties, root, stack));
      }
    }
  }
  return errors;
}

export function validUnder(schema, instance, root = schema) {
  return apply(instance, schema, root, []).length === 0;
}

function usedNode(doc, pointer) {
  const hit = getAtPointer(doc, pointer);
  if (!hit.present) return { ok: false, schema: null };
  return { ok: true, schema: hit.value };
}

export function checkWitnesses(entry, documents) {
  if (entry.transport !== "compare") {
    return { ok: true, relation: entry.specified.relation };
  }
  const pointer = (entry.used && entry.used.pointers && entry.used.pointers[0]) || "";
  const beforeNode = usedNode(documents.before, pointer);
  const afterNode = usedNode(documents.after, pointer);
  if (!beforeNode.ok || !afterNode.ok) {
    return { ok: false, problems: ["used pointer missing in before/after"] };
  }
  const problems = [];
  const witnesses = entry.witnesses || {};
  const beforeRoot = documents.before;
  const afterRoot = documents.after;
  const has = (key) => Object.prototype.hasOwnProperty.call(witnesses, key);

  if (has("validBeforeInvalidAfter")) {
    const inst = witnesses.validBeforeInvalidAfter;
    if (!validUnder(beforeNode.schema, inst, beforeRoot)) problems.push("validBeforeInvalidAfter fails before");
    if (validUnder(afterNode.schema, inst, afterRoot)) problems.push("validBeforeInvalidAfter still valid after");
  }
  if (has("invalidBeforeValidAfter")) {
    const inst = witnesses.invalidBeforeValidAfter;
    if (validUnder(beforeNode.schema, inst, beforeRoot)) problems.push("invalidBeforeValidAfter still valid before");
    if (!validUnder(afterNode.schema, inst, afterRoot)) problems.push("invalidBeforeValidAfter fails after");
  }
  if (has("validBoth")) {
    const inst = witnesses.validBoth;
    if (!validUnder(beforeNode.schema, inst, beforeRoot)) problems.push("validBoth fails before");
    if (!validUnder(afterNode.schema, inst, afterRoot)) problems.push("validBoth fails after");
  }

  if (entry.specified.relation === "incompatible" && !has("validBeforeInvalidAfter")) {
    problems.push("incompatible case needs validBeforeInvalidAfter");
  }
  if (entry.specified.relation === "compatible" && has("validBeforeInvalidAfter")) {
    problems.push("compatible case must not include a before-valid after-invalid witness");
  }
  if (entry.specified.change === "weakening" && !has("invalidBeforeValidAfter")) {
    problems.push("weakening case needs invalidBeforeValidAfter");
  }

  return { ok: problems.length === 0, problems };
}
