import { createHash } from 'node:crypto';
import { check, object, id, str, digest, hash, safeData, copy, freeze, ref, refOf,
  sameRef, validateVersion, validateShape, checkShape } from '../../capabilities/src/contracts.mjs';
export { hash, copy, freeze, refOf, sameRef, check, checkShape };
export const SCHEMA = 'neomorphic.foundry.portable-execution';
export const ABI = 'vf08.transform-buffer.v1';
export const PROFILE = freeze({ id: 'vf08.wasmtime49-linux-x64-fixed.v1', runtime: 'wasmtime-py', version: '49.0.0',
  wheelSha256: '94f0288f9e1c33924995a72bb769f4c4e2885002391589dd6992cdaa35d1990a',
  license: 'Apache-2.0 WITH LLVM-exception', platform: 'linux', arch: 'x64',
  imports: 'none', memory: 'fixed-wasm32', tables: 'fixed-funcref', nan: 'canonical', parallelCompilation: false });
export const CAPS = freeze({ moduleBytes: 262144, inputBytes: 16384, outputBytes: 32768,
  memoryBytes: 4194304, tableElements: 128, stackBytes: 65536, fuel: 10000000,
  compileMs: 3000, instantiateMs: 1000, executeMs: 2000, wallMs: 8000,
  addressSpaceBytes: 536870912, cpuSeconds: 2, hostStackBytes: 8388608, fileBytes: 1048576, openFiles: 32 });
export const DEFAULT_LIMITS = freeze({ ...CAPS, memoryBytes: 262144, fuel: 1000000,
  compileMs: 1500, instantiateMs: 500, executeMs: 500, wallMs: 4000 });
export const bytesHash = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
export function validateLimits(limits) {
  object(limits, Object.keys(CAPS), 'limits');
  for (const [key, cap] of Object.entries(CAPS)) check(Number.isSafeInteger(limits[key])
    && limits[key] >= (cap === 0 ? 0 : 1) && limits[key] <= cap, `unsupported limit:${key}`);
  check(limits.memoryBytes % 65536 === 0, 'memory must be whole pages');
}
function dataContract(c) {
  object(c, ['encoding', 'shape'], 'data contract');
  check(['json', 'bytes'].includes(c.encoding), 'unsupported encoding');
  if (c.encoding === 'json') validateShape(c.shape); else check(c.shape === null, 'bytes shape must be null');
}
export function validateArtifact(a, moduleBytes) {
  safeData(a); object(a, ['schema', 'id', 'capability', 'module', 'abi', 'input', 'output', 'profile', 'limits', 'evaluation'], 'artifact');
  check(a.schema === `${SCHEMA}.artifact.v1`, 'artifact schema');
  validateVersion(a.capability); object(a.module, ['digest', 'bytes'], 'module'); digest(a.module.digest);
  check(a.abi === ABI && hash(a.profile) === hash(PROFILE), 'unsupported runtime/profile');
  validateLimits(a.limits); dataContract(a.input); dataContract(a.output);
  check(Number.isSafeInteger(a.module.bytes) && a.module.bytes >= 8 && a.module.bytes <= a.limits.moduleBytes, 'module size');
  object(a.evaluation, ['id', 'revision', 'suiteDigest'], 'evaluation'); id(a.evaluation.id); str(a.evaluation.revision, 'evaluation revision'); digest(a.evaluation.suiteDigest);
  const { id: artifactId, ...body } = a; check(hash(body) === artifactId, 'artifact digest mismatch');
  check(a.capability.dependencies.length === 0, 'composition mapping unavailable');
  check(a.capability.provenance.refs.includes(a.module.digest), 'manifest must bind module bytes');
  if (a.input.encoding === 'json') check(hash(a.input.shape) === hash(a.capability.input), 'input contract mismatch');
  if (a.output.encoding === 'json') check(hash(a.output.shape) === hash(a.capability.output), 'output contract mismatch');
  if (moduleBytes !== undefined) check(Buffer.isBuffer(moduleBytes) && moduleBytes.length === a.module.bytes
    && bytesHash(moduleBytes) === a.module.digest, 'module bytes mismatch');
  return a;
}
export function createArtifact(body) {
  const a = { ...copy(body), schema: `${SCHEMA}.artifact.v1` };
  check(!Object.hasOwn(a, 'id'), 'id is computed'); a.id = hash(a); validateArtifact(a); return freeze(a);
}
export function encodeInput(a, input) {
  let bytes;
  if (a.input.encoding === 'json') {
    safeData(input); check(checkShape(a.input.shape, input).length === 0, 'input shape'); bytes = Buffer.from(JSON.stringify(input));
  } else { check(Buffer.isBuffer(input) || input instanceof Uint8Array, 'input must be bytes'); bytes = Buffer.from(input); }
  check(bytes.length <= a.limits.inputBytes, 'input size'); return bytes;
}
export function decodeOutput(a, bytes) {
  check(bytes.length <= a.limits.outputBytes, 'output size');
  if (a.output.encoding === 'bytes') return bytes;
  const output = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  safeData(output); check(checkShape(a.output.shape, output).length === 0, 'output shape'); return output;
}
export function validateBinding(b, artifact) {
  safeData(b); object(b, ['assignmentId', 'candidateId', 'fence', 'capability', 'sourceDigest', 'artifactId', 'moduleDigest',
    'dependencyDigest', 'evaluator', 'environmentDigest', 'runtimePin'], 'binding');
  id(b.assignmentId); id(b.candidateId); str(b.fence, 'fence'); ref(b.capability);
  check(sameRef(b.capability, refOf(artifact.capability)), 'candidate capability mismatch');
  check(b.sourceDigest === hash(artifact.capability.source) && b.artifactId === artifact.id
    && b.moduleDigest === artifact.module.digest && b.dependencyDigest === hash(artifact.capability.dependencies), 'candidate binding mismatch');
  check(hash(b.evaluator) === hash(artifact.evaluation), 'evaluator mismatch'); digest(b.environmentDigest); digest(b.runtimePin);
}
