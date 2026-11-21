// Runner facts for an accepted cc0.query-key-caller.v4 artifact.
// Existing SDS machine producers render this object. It is not a second catalog.
// It stays outside the measured hosted-wallet source walk and the host pin,
// because those bytes are the Root-approved measurement fingerprint.
export const QUERY_KEY_CALLER_SCHEMA = 'cc0.query-key-caller.v4';

export const QUERY_KEY_CONSUMER = Object.freeze({
  schema: QUERY_KEY_CALLER_SCHEMA,
  runner: Object.freeze({
    name: 'query-key',
    version: '1.1.0',
    archive: 'https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz',
    alternateArchive: 'https://raw.githubusercontent.com/epistemedeus/samedaydesk/32437117e5232480b18349721069b2a8a0fc2a2c/experiments/agl-seed-loop-20261104/fixtures/query-key-1.1.0.tar.gz',
    sha256: '51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa',
    bytes: 14566,
  }),
  acquire: 'curl -fsSL -o query-key.tar.gz https://neomorphic.io/downloads/query-key/1.1.0/query-key.tar.gz',
  apply: 'node apply.mjs apply --artifact corpus.json --input examples/next-consumer.json',
  source: Object.freeze({
    repository: 'https://github.com/epistemedeus/neomorphic-io',
    commit: 'bb78211863af9bfb9d18e71ecc32af4ecb0a0902',
    path: 'tools/query-key-1.1.0',
  }),
  acceptedWork: 'https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/accepted-work',
  reuse: Object.freeze({
    license: 'CC0-1.0',
    artifactPathSuffix: '/{taskId}/artifact',
    applyCaller: 'node query-key-1.1.0/apply.mjs apply --artifact query-key-1.1.0/corpus.json --input caller.json',
  }),
  // Paths into the raw HTTP JSON body. The accepted-work envelope is {ok, value}.
  // value.publicArtifact is that body. publicArtifact at the root is not a response field.
  extract: Object.freeze({
    artifact: 'value.publicArtifact',
    schema: 'value.publicArtifact.schema',
    digest: 'value.publicArtifactDigest',
    list: 'value.items',
  }),
});

export function queryKeyReuseMarkdown() {
  const { runner, reuse, schema, extract } = QUERY_KEY_CONSUMER;
  return [
    '',
    '## Reuse an accepted query-key result',
    '',
    `- Query-key alternate archive (same bytes if the primary host is unreachable): ${runner.alternateArchive}`,
    `- Verify either archive is ${runner.bytes} bytes and has the SHA-256 above before extracting.`,
    '- Append the selected task ID to the collection URL for detail, then `/artifact` for the reusable bytes. Match `taskId`, `rightsDigest`, and `publicArtifactDigest` across the three responses.',
    `- Save \`${extract.artifact}\` as \`caller.json\` only for \`${schema}\` under \`${reuse.license}\`.`,
    `- Run \`${reuse.applyCaller}\` from the directory containing \`caller.json\`. The older command uses the bundled example.`,
    '',
  ].join('\n');
}

export function consumerLinkage(artifact) {
  if (!artifact || artifact.schema !== QUERY_KEY_CALLER_SCHEMA) return null;
  return structuredClone(QUERY_KEY_CONSUMER);
}
