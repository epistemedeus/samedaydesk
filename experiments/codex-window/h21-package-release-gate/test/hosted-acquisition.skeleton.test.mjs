import { test } from 'node:test';

// Intentionally TODO. These are acceptance obligations, not passing hosted-service evidence.
test.todo('GET repeated, missed, expired, pending, and restarted IDs leaves execution/payment/outbox attempt counters unchanged');
test.todo('authenticated A may retrieve only A + executionId + frozen requestHash; B/anonymous learn no result or artifact metadata');
test.todo('same ID with changed frozen input, terms, principal, receipt or output tuple refuses, including after restart');
test.todo('commit-before-response interruption recovers the same result; precommit ambiguity never starts another engine');
test.todo('expiry is persisted, checked on every read, survives restart, and keeps an admission tombstone after byte deletion');
test.todo('only the promised named files, byte lengths and hashes are served; substituted or truncated files refuse before headers');
test.todo('traversal, encoding aliases, NUL, slash/backslash, absolute paths, symlinks, hardlinks, devices and path-swap races refuse');
test.todo('per-file/total/count/time/concurrency bounds hold; Range and redirects refuse; abort releases handles and never executes');
test.todo('D14 downloads from a second directory with no shared host path and verifies principal/request/receipt/output binding');
test.todo('existing mailbox/outbox identity and acknowledgment semantics remain; download and callback ack never imply a sale or buyer acceptance');
