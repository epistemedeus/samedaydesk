#!/usr/bin/env node
// Derives the 0.1.3 client archive from the immutable 0.1.2 archive. Dependency-free.
// It reads 0.1.2 and never writes it. Every member keeps its 0.1.2 order and tar
// header. Four members change: bin/client-io.mjs and bin/caller.mjs are replaced
// by the repaired SDS sources at the pinned hashes below, and the version field in
// package.json and npm-shrinkwrap.json moves from 0.1.2 to 0.1.3. Rights notices and
// every other member stay byte-identical. No license field is added.
//   node releases/derive-0.1.3.mjs            write releases/neomorphic-machine-gateway-0.1.3.tgz (exclusive)
//   node releases/derive-0.1.3.mjs --check    rebuild in memory and compare with the committed archive
//   node releases/derive-0.1.3.mjs --out FILE write to FILE (exclusive)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync, constants } from "node:zlib";

const here = path => new URL(path, import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => { throw Object.assign(new Error(code), { code }); };

export const BASE = Object.freeze({ version: "0.1.2", archive: "neomorphic-machine-gateway-0.1.2.tgz",
  sha256: "0171af58f67ac845b720ee6d1cf7765cc1a0b4c65c5b258fc1dbd5ea99f5cfb6", bytes: 53193 });
export const VERSION = "0.1.3";
export const ARCHIVE = `neomorphic-machine-gateway-${VERSION}.tgz`;
// Repaired client sources, exactly as received in the SDS source PR #398.
export const REPLACED = Object.freeze({
  "bin/client-io.mjs": { from: "a24d2df5fd403fccbbd308d7759d50d293f6984154a9fbbf7e3380ad0d427807", to: "c6613e44349a5741308d551df41c85b55709f48ea1ce7cf72f229dc00939a8aa" },
  "bin/caller.mjs": { from: "27ea509d672c71a726ea6ff58364ae66bf5a4fc4ef065159a398aea74835aab1", to: "55576da6a5232e1727c68bb324f3d8102ed35c3a52319bfc5d7b3cee8673b54b" },
});
export const VERSIONED = Object.freeze(["package.json", "npm-shrinkwrap.json"]);

export function readTar(tgz) {
  const tar = gunzipSync(tgz), entries = [];
  let at = 0;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString("latin1").replace(/\0.*$/s, "");
    const prefix = header.subarray(345, 500).toString("latin1").replace(/\0.*$/s, "");
    const type = String.fromCharCode(header[156] || 48);
    if (type !== "0" || prefix) fail("archive_member_unsupported");
    const size = parseInt(header.subarray(124, 136).toString("latin1").replace(/[\0 ]+$/, ""), 8);
    entries.push({ name, header: Buffer.from(header), data: Buffer.from(tar.subarray(at + 512, at + 512 + size)) });
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function headerFor(header, size) {
  const next = Buffer.from(header);
  next.write(size.toString(8).padStart(10, "0") + " \0", 124, 12, "latin1"); // 0.1.2 field layout
  next.fill(0x20, 148, 156);
  let sum = 0; for (const byte of next) sum += byte;
  next.write(sum.toString(8).padStart(6, "0") + " \0", 148, 8, "latin1");
  return next;
}

export function writeTgz(entries) {
  const parts = [];
  for (const { header, data } of entries) {
    parts.push(headerFor(header, data.length), data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  parts.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(parts), { level: constants.Z_BEST_COMPRESSION });
  gz[8] = 2; gz[9] = 255; // the same gzip header bytes as the 0.1.2 archive
  return gz;
}

function bumpVersion(text, name) {
  const from = `"version": "${BASE.version}"`, to = `"version": "${VERSION}"`;
  const expected = name === "package.json" ? 1 : 2; // shrinkwrap: top level and packages[""]
  if (text.split(from).length - 1 !== expected) fail(`version_field_unexpected:${name}`);
  const json = JSON.parse(text);
  if (json.name !== "@neomorphic/machine-gateway" || json.license !== undefined) fail(`package_identity_unexpected:${name}`);
  return text.replaceAll(from, to);
}

export function derive({ base = readFileSync(here(`./${BASE.archive}`)), source = path => readFileSync(here(`../${path}`)) } = {}) {
  if (base.length !== BASE.bytes || sha256(base) !== BASE.sha256) fail("base_archive_changed");
  const entries = readTar(base).map(entry => {
    const path = entry.name.replace(/^package\//, "");
    if (REPLACED[path]) {
      if (sha256(entry.data) !== REPLACED[path].from) fail(`base_member_changed:${path}`);
      const data = source(path);
      if (sha256(data) !== REPLACED[path].to) fail(`repaired_source_changed:${path}`);
      return { ...entry, data: Buffer.from(data) };
    }
    if (VERSIONED.includes(path)) return { ...entry, data: Buffer.from(bumpVersion(entry.data.toString("utf8"), path)) };
    return entry;
  });
  return writeTgz(entries);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bytes = derive(), args = process.argv.slice(2);
  if (args[0] === "--check") {
    const committed = readFileSync(here(`./${ARCHIVE}`));
    if (!committed.equals(bytes)) fail("derived_archive_differs");
  } else {
    const out = args[0] === "--out" ? args[1] : here(`./${ARCHIVE}`);
    if (!out) fail("output_required");
    writeFileSync(out, bytes, { flag: "wx", mode: 0o644 });
  }
  console.log(`${sha256(bytes)}  ${ARCHIVE}  ${bytes.length} bytes`);
}
