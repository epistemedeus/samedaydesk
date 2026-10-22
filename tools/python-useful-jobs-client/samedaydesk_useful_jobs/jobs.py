"""Invoke the pinned Node CLI; own transport and delivery, never job semantics."""

from contextlib import nullcontext
import os
from pathlib import Path
import uuid

from .acquire import acquire
from .delivery import publication, strict_json, validate_outputs
from .honesty import inspect_argv, refuse_sale_intent, sample_envelope
from .pins import HASH_TERMS, JOB_IDS
from .process import spawn_node, resolve_node_bin
from .refuse import ClientRefuse

PATH_FLAGS = frozenset({'--before', '--after', '--used', '--input', '--job', '--next-run', '--input-root', '--fixture'})


def _bind_job(job):
    if job not in JOB_IDS:
        raise ClientRefuse('unknown-job', f'unknown job {job}', job=job, jobs=list(JOB_IDS))


def _parse_engine_json(stdout):
    try:
        report = strict_json(stdout.strip())
        if not isinstance(report, dict) or not isinstance(report.get('ok'), bool):
            raise ValueError('report must be one object with boolean ok')
        return report
    except (ValueError, UnicodeError, RecursionError) as err:
        raise ClientRefuse('invalid-engine-report', 'engine stdout must be one complete JSON object', executed=True) from err


def _success(result):
    # A parseable success printed before a nonzero exit is still a failed run.
    if result.returncode != 0:
        raise ClientRefuse('engine-failed', 'engine exited unsuccessfully', executed=True,
                           engineStatus=result.returncode, engineStdout=result.stdout, engineStderr=result.stderr)
    report = _parse_engine_json(result.stdout)
    if report.get('sold') is True or report.get('sale') is True:
        raise ClientRefuse('sample-as-sale', 'engine claimed a sale', executed=True)
    if report.get('purchaseAuthority') is True:
        raise ClientRefuse('purchase-authority', 'engine claimed purchase authority', executed=True)
    if report.get('status') is not None and not isinstance(report['status'], str):
        raise ClientRefuse('invalid-engine-report', 'engine status must be a string', executed=True)
    if report['ok'] is not True or report.get('refused') is True or report.get('status') in {'refused', 'failed', 'error'}:
        raise ClientRefuse('engine-failed', 'engine refused the input', executed=True, engineStatus=0, engine=report)
    return report


def _metadata(kit):
    return dict(kitRoot=str(kit.kit_root), source=kit.source, sha256=kit.sha256, bytes=kit.bytes,
                sold=False, purchaseAuthority=False, extracted=True, executed=True, kind='local-runtime')


def list_jobs(*, archive=None, origin=None, kit=None):
    with (nullcontext(kit) if kit is not None else acquire(archive=archive, origin=origin)) as kit:
        result = spawn_node(kit, ['list', '--json'])
        engine = _success(result)
        jobs = engine.get('jobs')
        ids = [j.get('id') for j in jobs if isinstance(j, dict)] if isinstance(jobs, list) else []
        if tuple(ids) != JOB_IDS or any(not isinstance(j.get('outputs'), list) or tuple(j['outputs']) != HASH_TERMS.outputs_for(j['id']) for j in jobs):
            raise ClientRefuse('catalog-mismatch', 'node list differs from pinned catalog', listed=ids, executed=True)
        return dict(ok=True, command='list', jobs=ids, engine=engine, engineStatus=0,
                    engineStderr=result.stderr, **_metadata(kit))


def help_job(job_id=None, *, archive=None, origin=None, kit=None):
    if job_id:
        _bind_job(job_id)
    with (nullcontext(kit) if kit is not None else acquire(archive=archive, origin=origin)) as kit:
        result = spawn_node(kit, ['help'] + ([job_id] if job_id else []))
        if result.returncode or not result.stdout.strip():
            raise ClientRefuse('engine-failed', 'engine help failed', executed=True, engineStatus=result.returncode)
        return dict(ok=True, command='help', job=job_id, jobs=list(JOB_IDS), engineStdout=result.stdout,
                    engineStderr=result.stderr, engineStatus=0, **_metadata(kit))


def _prepare_argv(job, argv):
    # The release has several different parsers, none share reliable equals or
    # duplicate-option semantics. Normalize supported transport options once.
    prefix = []
    if job == 'page-change-offline-job' and argv and argv[0] in {'job', 'compare', 'journey'}:
        prefix, argv = [argv[0]], argv[1:]
    example, sale_reasons, args = inspect_argv(argv)
    refuse_sale_intent(example, sale_reasons)
    seen = set()
    forwarded = prefix
    output = None
    index = 0
    while index < len(args):
        item = args[index]
        if not isinstance(item, str) or '\x00' in item:
            raise ClientRefuse('invalid-args', 'arguments must be NUL-free strings')
        try:
            item.encode('utf-8', 'strict')
        except UnicodeError as err:
            raise ClientRefuse('invalid-args', 'arguments must be valid Unicode') from err
        flag, equal, value = item.partition('=')
        if not flag.startswith('--') or flag == '--' or flag in seen:
            raise ClientRefuse('invalid-args', 'positional, duplicate or ambiguous options are refused')
        seen.add(flag)
        index += 1
        if flag in PATH_FLAGS or flag == '--out-dir':
            if not equal:
                if index == len(args) or args[index].startswith('--'):
                    raise ClientRefuse('missing-args', f'{flag} requires a path')
                value = args[index]
                index += 1
            if not value or '\x00' in value:
                raise ClientRefuse('invalid-args', f'{flag} requires a nonempty path')
            # Route URLs retain the released engine's loopback policy.
            if not (job == 'route-table-diff' and flag in {'--before', '--after'} and value.startswith(('http://', 'https://'))):
                value = os.path.abspath(os.path.expanduser(value))
            if flag == '--out-dir':
                output = value
            else:
                forwarded.extend([flag, value])
        elif flag == '--example':
            if equal:
                raise ClientRefuse('invalid-args', '--example is a boolean flag without a value')
            forwarded.append(flag)
        else:
            # Preserve other engine options literally; reserve transport options
            # above so no later duplicate can redirect the owned output stage.
            forwarded.append(item)
            if not equal and index < len(args) and not args[index].startswith('--'):
                forwarded.append(args[index])
                index += 1
    for value in forwarded:
        try:
            if '\x00' in value:
                raise ValueError('NUL')
            value.encode('utf-8', 'strict')
        except (UnicodeError, ValueError) as err:
            raise ClientRefuse('invalid-args', 'arguments must be valid Unicode without NUL') from err
    return example, forwarded, Path(output) if output else Path.cwd() / f'useful-jobs-{job}-{uuid.uuid4().hex}'


def run_job(job_id, argv=None, *, archive=None, origin=None, kit=None, node_bin=None):
    _bind_job(job_id)
    example, args, output = _prepare_argv(job_id, argv or [])
    with (nullcontext(kit) if kit is not None else acquire(archive=archive, origin=origin)) as kit:
        try:
            with publication(output) as (stage, publish):
                result = spawn_node(kit, ['run', job_id, *args, '--out-dir', str(stage)], node_bin=node_bin)
                engine = _success(result)
                owned = engine.get('outDir') == str(stage)
                if job_id == 'page-change-offline-job':
                    owned = engine.get('written') == {'jsonPath': str(stage / 'page-change.json'), 'mdPath': str(stage / 'page-change.md')}
                if not owned:
                    raise ClientRefuse('output-ownership', 'engine reported a different output directory', executed=True)
                artifacts = validate_outputs(stage, job_id, engine)
                publish()
                # Only the transport-owned outDir changes. Artifact content and
                # diagnostic strings retain the engine's exact provenance.
                engine = dict(engine, outDir=str(output))
                if job_id == 'page-change-offline-job':
                    engine['written'] = {'jsonPath': str(output / 'page-change.json'), 'mdPath': str(output / 'page-change.md')}
                expected = list(HASH_TERMS.outputs_for(job_id))
                payload = _metadata(kit)
                payload.update(sample_envelope(example))
                payload.update(ok=True, command='run', job=job_id, outDir=str(output), outputs=expected,
                               outputsFound=expected, outputsExist=True, artifacts=artifacts,
                               engine=engine, engineStatus=0, engineStderr=result.stderr, outcome='complete',
                               domainStatus=engine.get('status', engine.get('outcome')), published=True,
                               acceptanceClass=payload['kind'])
                return payload
        except ClientRefuse as err:
            err.extra.setdefault('extracted', True)
            raise
        except OSError as err:
            raise ClientRefuse('runtime-io-failed', str(err), extracted=True, executed=True) from err
