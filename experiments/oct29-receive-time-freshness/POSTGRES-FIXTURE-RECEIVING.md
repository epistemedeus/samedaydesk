# Shared disposable Postgres fixture receiving

CI run 40954057549 passed the repaired caller closure, then failed before original-task assertions: the shared fixture only searched PostgreSQL 16/17 directories and ignored PULSE_PG_BIN supplied by its CI consumer. The runner did not emit its pg_config version, so no version is inferred from that failure. The same-VM counter-environment is PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) at /usr/lib/postgresql/16/bin.

The fixture now honors an explicit complete executable PULSE_PG_BIN or refuses it, then resolves actual pg_config --bindir or a complete PATH directory. It contains no version list. Resolution is lazy at cluster creation. The cluster exposes its selected bin, which the freshness restart check now consumes instead of another fixed 16 path.

Seven focused controls cover a future-version directory, pg_config and PATH discovery, invalid/relative/empty explicit selection, missing executables and unavailable binaries. The workflow runs them directly without changing the root npm manifest. All CI-selected suites plus managed-watch and the installed HTTP/Postgres/recovery check were run serially on the actual VM with its tool-resolved PULSE_PG_BIN. Full logs and new installed evidence are preserved in evidence/postgres-fixture-receiving.json.

None of the changed test/workflow members belongs to the 548-member caller closure, so its accepted digest and predecessor list remain unchanged. No production configuration, database or service was changed. Original native and both CI failures remain historical evidence.
