# Explanation: why useful-jobs is an offline pin, not a hosted job

This page is background. It does not walk you through a run. For steps see
[tutorial.md](tutorial.md).

## What this surface is

SameDayDesk publishes a downloadable archive of ten local jobs. An agent
copies two (or more) files it already holds, runs `bin/useful-jobs.mjs`, and
gets a brief. The product is the comparison, not a hosted crawler and not a
payment.

That is why discovery sets `purchaseAuthority: false`, `paidHostedClaim:
false`, and `schedulerDaemon: false`. A later purchase of
`POST /extract/batch` on the machine gateway is a different product. These
jobs do not start it.

## Why size and digest happen before extract

Agent VMs have seen transport failures on the apex site. A 200 response is
not proof that the bytes are the 1.4.7 archive. The acquire function checks
length `5255824` and SHA-256
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` **before**
`tar` and **before** `node`. A mismatch deletes the temp directory. Silent
fallback to an older tarball would mix pins.

The follow-the-doc seeded failure `digest-mismatch` exists to keep that
rule honest: a body of the right length with the wrong hash must not
produce a kit.

## Why stdout is only the kit path

Install recipes get wrapped in `if` / `&&`. If `list` printed job ids on
stdout, `kit=$(useful_jobs_acquire)` would capture those ids and later
`node "$kit/bin/..."` would point at garbage. Diagnostics go to stderr.
The printed path is the only success value.

## Why `--example` is explicit (and refused on page-change)

Labeled samples ship inside the archive so a cold agent can see a green
run without inventing customer files. They are not live watches.

`--example` is the consent flag that says "I know this is the kit sample."
`page-change-offline-job` still refuses it (`sample_as_delivered_watch`)
because a page-change brief looks like a delivered monitoring result. The
job only runs on a caller-supplied `--job` document that already holds
before/after JSON.

## Why `ok: true` is not a certificate

The CLI uses `ok` for "the runner completed without crashing and wrote
what it could say." Schema-valid output remains caller-selected evidence.
It is not independent attestation, not a customer delivery, and not a
reason to publish.

## Why 1.4.7 sits beside older tarballs

Public URLs for 1.0.0 through 1.4.0 stay put so a pin in an old runbook
does not silently retarget. 1.4.7 adds a fresh review of five jobs and
inherits the other five. Versions 1.4.1 through 1.4.6 were never public
downloads. Pointing `--expected-sha256` at 1.4.7 while fetching 1.4.0 is a
digest mismatch, not a compatible upgrade.

## Why this documentation is Diátaxis

Agents mix "teach me," "do this task," "what is the flag," and "why."
Those needs fight if they share one page. The tutorial is on rails. The
how-to assumes competence. The reference is tables. This file is the why.
The cold follow-the-doc run only executes tutorial and how-to fences plus
the seeded refusals. It does not treat this explanation as a script.
