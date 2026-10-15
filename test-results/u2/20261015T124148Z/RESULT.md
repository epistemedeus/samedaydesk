# AE21 U2 remote result (20261015T124148Z)

- **Verdict: blocked**
- Failing step: `BRANCH_DOES_NOT_CONTAIN_U2`
- Runner: unmodified `u2.sh` blob `5947abe68a15f5b51ebf32cff63bcee5ef7b6417` (pilot `19f62ce1bfd87d6cef95134f92c53af4354397b3`). Postgres prerequisites finished (`PG ok`, ssl=on). The script then fetched base `daa3bdee79c441ba89559ea4eb2c749e312435fd` and `refs/heads/codex/ae21-u2-sds-url-extract` together and set `TIP=$(git rev-parse FETCH_HEAD)`, which is the first FETCH_HEAD record (the base). `git merge-base --is-ancestor d6988a152f8a8bdbea348e91a99c3b6647a90803` against that tip failed, so the script exited before RED.
- Remote `codex/ae21-u2-sds-url-extract` is `d6988a152f8a8bdbea348e91a99c3b6647a90803`, whose parent is `daa3bdee79c441ba89559ea4eb2c749e312435fd`. No product code was edited. RED, GREEN, and the full suites did not run.
- `test-results/` is gitignored at this commit, so this file was recorded with `git add -f`.

Last 60 log lines (scanned; no database URL or secret match). The final `EXIT:0` is the outer `tee` pipeline status. The script stopped at `BRANCH_DOES_NOT_CONTAIN_U2`.

```
Created symlink /etc/systemd/system/sysstat.service.wants/sysstat-collect.timer → /usr/lib/systemd/system/sysstat-collect.timer.

Created symlink /etc/systemd/system/sysstat.service.wants/sysstat-summary.timer → /usr/lib/systemd/system/sysstat-summary.timer.

Created symlink /etc/systemd/system/multi-user.target.wants/sysstat.service → /usr/lib/systemd/system/sysstat.service.

Setting up libpopt0:amd64 (1.19+dfsg-1build1) ...
Setting up logrotate (3.21.0-2build1) ...
Created symlink /etc/systemd/system/timers.target.wants/logrotate.timer → /usr/lib/systemd/system/logrotate.timer.

Setting up libjson-xs-perl (4.040-0ubuntu0.24.04.1) ...
Setting up postgresql-client-16 (16.15-0ubuntu0.24.04.1) ...
update-alternatives: using /usr/share/postgresql/16/man/man1/psql.1.gz to provide /usr/share/man/man1/psql.1.gz (psql.1.gz) in auto mode
Setting up ca-certificates (20260601~24.04.1) ...
Updating certificates in /etc/ssl/certs...
rehash: warning: skipping ca-certificates.crt,it does not contain exactly one certificate or CRL
14 added, 39 removed; done.
Setting up ssl-cert (1.1.2ubuntu1) ...
Created symlink /etc/systemd/system/multi-user.target.wants/ssl-cert.service → /usr/lib/systemd/system/ssl-cert.service.

Setting up postgresql-common (257build1.1) ...

Creating config file /etc/postgresql-common/createcluster.conf with new version
Building PostgreSQL dictionaries from installed myspell/hunspell packages...
  en_us
Removing obsolete dictionary files:
invoke-rc.d: could not determine current runlevel
invoke-rc.d: policy-rc.d denied execution of start.
Created symlink /etc/systemd/system/multi-user.target.wants/postgresql.service → /usr/lib/systemd/system/postgresql.service.

Setting up postgresql-16 (16.15-0ubuntu0.24.04.1) ...
Creating new PostgreSQL cluster 16/main ...
/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/16/main --auth-local peer --auth-host scram-sha-256 --no-instructions
The files belonging to this database system will be owned by user "postgres".
This user must also own the server process.

The database cluster will be initialized with locale "C.UTF-8".
The default database encoding has accordingly been set to "UTF8".
The default text search configuration will be set to "english".

Data page checksums are disabled.

fixing permissions on existing directory /var/lib/postgresql/16/main ... ok
creating subdirectories ... ok
selecting dynamic shared memory implementation ... posix
selecting default max_connections ... 100
selecting default shared_buffers ... 128MB
selecting default time zone ... Etc/UTC
creating configuration files ... ok
running bootstrap script ... ok
performing post-bootstrap initialization ... ok
syncing data to disk ... ok
invoke-rc.d: could not determine current runlevel
invoke-rc.d: policy-rc.d denied execution of start.
Processing triggers for man-db (2.12.0-4build2) ...
Processing triggers for libc-bin (2.39-0ubuntu8.7) ...
Processing triggers for ca-certificates (20260601~24.04.1) ...
Updating certificates in /etc/ssl/certs...
0 added, 0 removed; done.
Running hooks in /etc/ca-certificates/update.d...
done.
Processing triggers for ca-certificates-java (20240118) ...
done.
PG ok bin=/usr/lib/postgresql/16/bin ssl=on
BRANCH_DOES_NOT_CONTAIN_U2 tip=daa3bdee79c441ba89559ea4eb2c749e312435fd
EXIT:0
```
