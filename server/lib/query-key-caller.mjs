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
  // Paths into the raw HTTP JSON body. The accepted-work envelope is {ok, value}.
  // value.publicArtifact is that body. publicArtifact at the root is not a response field.
  extract: Object.freeze({
    artifact: 'value.publicArtifact',
    schema: 'value.publicArtifact.schema',
    digest: 'value.publicArtifactDigest',
    list: 'value.items',
  }),
});

export function consumerLinkage(artifact) {
  if (!artifact || artifact.schema !== QUERY_KEY_CALLER_SCHEMA) return null;
  return structuredClone(QUERY_KEY_CONSUMER);
}
