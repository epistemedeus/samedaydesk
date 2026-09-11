import { readFileSync } from "node:fs";

export function unwrapFixture(payload) {
  if (payload && typeof payload === "object" && payload.fixtureKind && "data" in payload) {
    return {
      labelled: true,
      fixtureKind: payload.fixtureKind,
      dataLabel: payload.dataLabel || "fixture",
      capturedAt: payload.capturedAt || null,
      source: payload.source || null,
      notes: payload.notes || null,
      inner: payload.data,
      wrapper: payload,
    };
  }
  return {
    labelled: false,
    fixtureKind: null,
    dataLabel: "derived",
    capturedAt: null,
    source: null,
    notes: null,
    inner: payload,
    wrapper: null,
  };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readFixtureFile(path) {
  return unwrapFixture(readJson(path));
}
