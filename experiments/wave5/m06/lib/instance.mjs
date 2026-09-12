const ANNOTATION = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "$defs",
  "definitions",
]);

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

function typeOk(instance, allowed) {
  if (!allowed.length) return true;
  const got = jsonType(instance);
  if (allowed.includes(got)) return true;
  if (got === "number" && Number.isInteger(instance) && allowed.includes("integer")) return true;
  return false;
}

export function validateInstance(instance, schema, root = schema, stack = []) {
  if (schema === true) return [];
  if (schema === false) {
    return [{ path: "", message: "false schema rejects every instance" }];
  }
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return [{ path: "", message: "unsupported schema node" }];
  }

  if (typeof schema.$ref === "string") {
    if (!schema.$ref.startsWith("#")) {
      return [{ path: "", message: "remote $ref is outside the instance oracle" }];
    }
    if (stack.includes(schema.$ref)) {
      return [{ path: "", message: "cyclic $ref" }];
    }
    const pointer = pointerFromLocalRef(schema.$ref);
    const hit = getAtPointer(root, pointer);
    if (!hit.present) return [{ path: "", message: `unresolved $ref ${schema.$ref}` }];
    const errors = validateInstance(instance, hit.value, root, [...stack, schema.$ref]);
    const siblings = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "$ref" || ANNOTATION.has(key)) continue;
      siblings[key] = value;
    }
    if (Object.keys(siblings).length) {
      errors.push(...applyKeywords(instance, siblings, root, stack));
    }
    return errors;
  }

  return applyKeywords(instance, schema, root, stack);
}

function applyKeywords(instance, schema, root, stack) {
  const errors = [];
  const allowed = typeList(schema);
  if (allowed.length && !typeOk(instance, allowed)) {
    errors.push({ path: "", message: `type ${allowed.join("|")} got ${jsonType(instance)}` });
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && !jsonEqual(instance, schema.const)) {
    errors.push({ path: "", message: "const mismatch" });
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, instance))) {
    errors.push({ path: "", message: "enum mismatch" });
  }

  if (typeof instance === "number") {
    if (typeof schema.minimum === "number" && instance < schema.minimum) {
      errors.push({ path: "", message: `minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && instance > schema.maximum) {
      errors.push({ path: "", message: `maximum ${schema.maximum}` });
    }
    if (typeof schema.exclusiveMinimum === "number" && instance <= schema.exclusiveMinimum) {
      errors.push({ path: "", message: `exclusiveMinimum ${schema.exclusiveMinimum}` });
    }
    if (typeof schema.exclusiveMaximum === "number" && instance >= schema.exclusiveMaximum) {
      errors.push({ path: "", message: `exclusiveMaximum ${schema.exclusiveMaximum}` });
    }
  }

  if (Array.isArray(instance) && Object.prototype.hasOwnProperty.call(schema, "items")) {
    for (const [index, item] of instance.entries()) {
      const child = validateInstance(item, schema.items, root, stack);
      for (const err of child) {
        errors.push({ path: `/${index}${err.path}`, message: err.message });
      }
    }
  }

  if (instance && typeof instance === "object" && !Array.isArray(instance)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(instance, key)) {
        errors.push({ path: "", message: `missing ${key}` });
      }
    }
    const properties =
      schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
        ? schema.properties
        : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(instance, key)) continue;
      const child = validateInstance(instance[key], childSchema, root, stack);
      for (const err of child) {
        errors.push({ path: `/${key}${err.path}`, message: err.message });
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(instance)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push({ path: "", message: `unexpected ${key}` });
        }
      }
    }
  }

  return errors;
}

export function instanceErrors(schema, instance) {
  return validateInstance(instance, schema, schema);
}

export function validUnder(schema, instance) {
  return instanceErrors(schema, instance).length === 0;
}

export function checkWitnesses(entry) {
  if (entry.transport === "refuse") {
    return { ok: true, relation: "refuse" };
  }
  const problems = [];
  const witnesses = entry.witnesses || {};
  if (witnesses.validBeforeInvalidAfter) {
    const inst = witnesses.validBeforeInvalidAfter;
    if (!validUnder(entry.before, inst)) problems.push("validBeforeInvalidAfter fails before");
    if (validUnder(entry.after, inst)) problems.push("validBeforeInvalidAfter still valid after");
  }
  if (witnesses.invalidBeforeValidAfter) {
    const inst = witnesses.invalidBeforeValidAfter;
    if (validUnder(entry.before, inst)) problems.push("invalidBeforeValidAfter still valid before");
    if (!validUnder(entry.after, inst)) problems.push("invalidBeforeValidAfter fails after");
  }
  if (witnesses.validBoth) {
    const inst = witnesses.validBoth;
    if (!validUnder(entry.before, inst)) problems.push("validBoth fails before");
    if (!validUnder(entry.after, inst)) problems.push("validBoth fails after");
  }
  if (witnesses.invalidBoth) {
    const inst = witnesses.invalidBoth;
    if (validUnder(entry.before, inst)) problems.push("invalidBoth valid before");
    if (validUnder(entry.after, inst)) problems.push("invalidBoth valid after");
  }

  if (entry.specified.relation === "incompatible" && !witnesses.validBeforeInvalidAfter) {
    problems.push("incompatible case needs validBeforeInvalidAfter");
  }
  if (entry.specified.relation === "compatible" && witnesses.validBeforeInvalidAfter) {
    problems.push("compatible case must not include a before-valid after-invalid witness");
  }
  if (entry.specified.change === "weakening" && !witnesses.invalidBeforeValidAfter) {
    problems.push("weakening case needs invalidBeforeValidAfter");
  }

  return { ok: problems.length === 0, problems };
}
