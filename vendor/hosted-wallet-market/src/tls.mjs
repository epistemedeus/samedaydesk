import {execFileSync} from 'node:child_process';
import {chmodSync, mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

function openssl(args, cwd) {
  execFileSync('openssl', args, {cwd, stdio: ['ignore', 'ignore', 'pipe'], timeout: 20000});
}

export function writeStagingCerts(dir) {
  mkdirSync(dir, {recursive: true});
  openssl(['genrsa', '-out', 'ca.key', '2048'], dir);
  openssl(['req', '-x509', '-new', '-key', 'ca.key', '-out', 'ca.crt', '-days', '2', '-subj', '/CN=root71-staging-ca'], dir);
  openssl(['genrsa', '-out', 'server.key', '2048'], dir);
  openssl(['req', '-new', '-key', 'server.key', '-out', 'server.csr', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], dir);
  openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '2', '-copy_extensions', 'copy'], dir);
  for (const name of ['ca.key', 'server.key']) chmodSync(join(dir, name), 0o600);
  return {
    caFile: join(dir, 'ca.crt'),
    certFile: join(dir, 'server.crt'),
    keyFile: join(dir, 'server.key'),
    ca: readFileSync(join(dir, 'ca.crt')),
    cert: readFileSync(join(dir, 'server.crt')),
    key: readFileSync(join(dir, 'server.key')),
  };
}
