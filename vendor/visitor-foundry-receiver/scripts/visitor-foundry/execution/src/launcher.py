"""Trusted stdlib bootstrap: set/check exact limits, then exec the same Python.

No site initialization (-I -S), stdin read, Wasmtime import or guest parsing here.
The worker interpreter starts under the limits and retains this PID/stdio.
"""
import os, sys

def fail(code):
    # Fixed typed protocol only. Never emit exception text, argv or environment.
    print('{"result":{"status":"error","code":"'+code+'","phase":"startup"}}', flush=True)
    raise SystemExit(2)

if len(sys.argv) < 8 or sys.argv[6] != '--':
    fail('launcher_arguments_invalid')
values = sys.argv[1:6]
caps = (536870912, 2, 8388608, 1048576, 32)
if any(not text.isascii() or not text.isdecimal() or len(text) > 10 for text in values):
    fail('launcher_arguments_invalid')
values = [int(text) for text in values]
if any(value < 1 or value > cap for value, cap in zip(values, caps)):
    fail('launcher_arguments_invalid')
try:
    import resource
    kinds = (resource.RLIMIT_AS, resource.RLIMIT_CPU, resource.RLIMIT_STACK,
             resource.RLIMIT_FSIZE, resource.RLIMIT_NOFILE, resource.RLIMIT_CORE)
except BaseException:
    fail('launcher_resource_unavailable')
try:
    for kind, value in zip(kinds, [*values, 0]):
        resource.setrlimit(kind, (value, value))
    if any(resource.getrlimit(kind) != (value, value) for kind, value in zip(kinds, [*values, 0])):
        fail('launcher_limits_unavailable')
except (OSError, ValueError):
    fail('launcher_limits_unavailable')
try:
    os.execv(sys.executable, [sys.executable, '-I', '-B', *sys.argv[7:]])
except BaseException:
    fail('launcher_exec_failed')
