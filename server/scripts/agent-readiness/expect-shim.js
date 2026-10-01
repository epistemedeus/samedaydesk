import assert from "node:assert/strict";

export { describe, it } from "node:test";

function includes(actual, expected) {
  if (typeof actual === "string" || Array.isArray(actual)) return actual.includes(expected);
  if (actual instanceof Set) return actual.has(expected);
  throw new assert.AssertionError({ message: "toContain needs a string, array, or set", actual });
}

export function expect(actual) {
  const api = {
    toBe(expected) {
      assert.equal(actual, expected);
    },
    toEqual(expected) {
      assert.deepEqual(actual, expected);
    },
    toStrictEqual(expected) {
      assert.deepEqual(actual, expected);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toBeNull() {
      assert.equal(actual, null);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toContain(expected) {
      assert.equal(includes(actual, expected), true, `${JSON.stringify(actual)} does not contain ${JSON.stringify(expected)}`);
    },
    toContainEqual(expected) {
      assert.ok(Array.isArray(actual), "toContainEqual needs an array");
      const found = actual.some((item) => {
        try {
          assert.deepEqual(item, expected);
          return true;
        } catch {
          return false;
        }
      });
      assert.equal(found, true, `missing ${JSON.stringify(expected)}`);
    },
    toMatch(expected) {
      assert.match(String(actual), expected);
    },
    toThrow(expected) {
      if (expected === undefined) assert.throws(actual);
      else assert.throws(actual, expected);
    },
    toBeGreaterThan(n) {
      assert.ok(actual > n, `${actual} > ${n}`);
    },
    toBeLessThan(n) {
      assert.ok(actual < n, `${actual} < ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      assert.ok(actual >= n, `${actual} >= ${n}`);
    },
    toBeLessThanOrEqual(n) {
      assert.ok(actual <= n, `${actual} <= ${n}`);
    },
    toHaveLength(n) {
      assert.equal(actual.length, n);
    },
    toMatchInlineSnapshot(snapshot) {
      const normalized = String(snapshot).trim().replace(/,(\s*[}\]])/g, "$1");
      assert.deepEqual(actual, JSON.parse(normalized));
    },
  };
  api.not = {
    toBe(expected) {
      assert.notEqual(actual, expected);
    },
    toEqual(expected) {
      assert.notDeepEqual(actual, expected);
    },
    toContain(expected) {
      assert.equal(includes(actual, expected), false);
    },
    toMatch(expected) {
      assert.doesNotMatch(String(actual), expected);
    },
  };
  return api;
}
