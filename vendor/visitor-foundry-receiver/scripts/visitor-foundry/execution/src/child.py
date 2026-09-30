"""Trusted single-request Wasmtime worker. No WASI, linker, AOT, or guest imports."""
import base64, hashlib, importlib.metadata, json, os, resource, sys, time

def emit(value):
    print(json.dumps(value, separators=(',', ':')), flush=True)

def require(ok, code):
    if not ok:
        raise ValueError(code)

class Reader:
    def __init__(self, data): self.data, self.pos = data, 0
    def byte(self):
        require(self.pos < len(self.data), 'truncated_module')
        value = self.data[self.pos]; self.pos += 1; return value
    def uint(self):
        value = 0
        for i in range(5):
            b = self.byte(); value |= (b & 127) << (7*i)
            if b < 128:
                require(value <= 0xffffffff, 'invalid_leb'); return value
        raise ValueError('invalid_leb')
    def take(self, n):
        require(n <= len(self.data)-self.pos, 'truncated_module')
        value = self.data[self.pos:self.pos+n]; self.pos += n; return value

def fixed_limits(r, cap):
    require(r.byte() == 1, 'fixed_limits_required')  # no shared, memory64, or unbounded maxima
    minimum, maximum = r.uint(), r.uint()
    require(minimum == maximum and maximum <= cap, 'fixed_resource_limit')

def admission(module, limits):
    require(module[:8] == b'\0asm\x01\0\0\0', 'binary_core_wasm_required')
    r = Reader(module[8:]); memories = 0; tables = 0
    while r.pos < len(r.data):
        section = r.byte(); part = Reader(r.take(r.uint()))
        require(section <= 12, 'unsupported_section')
        if section == 2: require(part.uint() == 0, 'imports_forbidden')
        if section == 4:
            count = part.uint(); tables += count; require(tables <= 1, 'table_count')
            for _ in range(count):
                require(part.byte() == 0x70, 'funcref_only'); fixed_limits(part, limits['tableElements'])
        if section == 5:
            count = part.uint(); memories += count; require(memories == 1, 'memory_count')
            fixed_limits(part, limits['memoryBytes']//65536)
        if section in (2, 4, 5): require(part.pos == len(part.data), 'section_trailing_data')
    require(memories == 1, 'one_memory_required')

start = time.monotonic(); phase = 'startup'; store = None; limits = None
try:
    # prlimit was applied before the interpreter started, even before reading input.
    line = sys.stdin.buffer.readline(450000)
    require(line.endswith(b'\n') and len(line) < 450000, 'request_size')
    request = json.loads(line); limits = request['limits']
    expected = [('addressSpaceBytes', resource.RLIMIT_AS), ('cpuSeconds', resource.RLIMIT_CPU),
                ('hostStackBytes', resource.RLIMIT_STACK), ('fileBytes', resource.RLIMIT_FSIZE), ('openFiles', resource.RLIMIT_NOFILE)]
    require(all(resource.getrlimit(kind) == (limits[key], limits[key]) for key, kind in expected), 'os_limits_unavailable')
    require(resource.getrlimit(resource.RLIMIT_CORE) == (0, 0), 'core_limit_unavailable')
    require(not any(k not in ('LANG', 'LC_ALL', 'LC_CTYPE') for k in os.environ), 'inherited_environment')
    import wasmtime as w
    require(importlib.metadata.version('wasmtime') == '49.0.0', 'runtime_version')
    module_bytes = base64.b64decode(request['module'], validate=True)
    data = base64.b64decode(request['input'], validate=True)
    require(len(module_bytes) <= limits['moduleBytes'] and len(data) <= limits['inputBytes'], 'payload_size')
    require('sha256:'+hashlib.sha256(module_bytes).hexdigest() == request['moduleDigest'], 'module_digest')
    phase = 'compile'; emit({'phase': phase})
    admission(module_bytes, limits)
    config = w.Config()
    config.consume_fuel = True; config.parallel_compilation = False
    config.cranelift_nan_canonicalization = True
    config.max_wasm_stack = limits['stackBytes']
    config.memory_reservation = limits['memoryBytes']; config.memory_reservation_for_growth = 0
    config.memory_guard_size = 65536; config.memory_init_cow = False
    for feature in ['wasm_threads', 'shared_memory', 'wasm_memory64', 'wasm_multi_memory', 'wasm_simd',
                    'wasm_relaxed_simd', 'wasm_component_model', 'wasm_gc', 'wasm_function_references',
                    'wasm_exceptions', 'wasm_stack_switching', 'wasm_tail_call', 'wasm_custom_page_sizes', 'wasm_wide_arithmetic']:
        setattr(config, feature, False)
    engine = w.Engine(config)
    compile_start = time.monotonic(); module = w.Module(engine, module_bytes)
    compile_ms = (time.monotonic()-compile_start)*1000
    require(len(module.imports) == 0, 'imports_forbidden')
    phase = 'instantiate'; emit({'phase': phase})
    store = w.Store(engine)
    store.set_limits(memory_size=limits['memoryBytes'], table_elements=limits['tableElements'], instances=1, tables=1, memories=1)
    store.set_fuel(limits['fuel'])
    instance_start = time.monotonic(); instance = w.Instance(store, module, [])
    exports = instance.exports(store)
    require(set(exports) == {'memory', 'alloc', 'transform'}, 'abi_exports')
    memory, alloc, transform = exports['memory'], exports['alloc'], exports['transform']
    require(isinstance(memory, w.Memory) and isinstance(alloc, w.Func) and isinstance(transform, w.Func), 'abi_types')
    require([str(t) for t in alloc.type(store).params] == ['i32'] and [str(t) for t in alloc.type(store).results] == ['i32'], 'alloc_signature')
    require([str(t) for t in transform.type(store).params] == ['i32', 'i32'] and [str(t) for t in transform.type(store).results] == ['i64'], 'transform_signature')
    instantiate_ms = (time.monotonic()-instance_start)*1000
    phase = 'execute'; emit({'phase': phase}); execute_start = time.monotonic()
    pointer = alloc(store, len(data)) & 0xffffffff
    size = memory.data_len(store)
    require(pointer <= size and len(data) <= size-pointer, 'input_pointer')
    memory.write(store, data, pointer)
    packed = transform(store, pointer, len(data)) & 0xffffffffffffffff
    out_pointer, length = packed & 0xffffffff, packed >> 32
    require(length <= limits['outputBytes'], 'output_size')
    size = memory.data_len(store)
    require(out_pointer <= size and length <= size-out_pointer, 'output_pointer')
    output = bytes(memory.read(store, out_pointer, out_pointer+length))
    usage = resource.getrusage(resource.RUSAGE_SELF)
    emit({'result': {'status': 'ok', 'output': base64.b64encode(output).decode(),
          'usage': {'cpuMs': (usage.ru_utime+usage.ru_stime)*1000, 'peakRssBytes': usage.ru_maxrss*1024,
                    'fuelUsed': limits['fuel']-store.get_fuel(), 'compileMs': compile_ms,
                    'instantiateMs': instantiate_ms, 'executeMs': (time.monotonic()-execute_start)*1000}}})
except BaseException as error:
    # Do not expose guest trap backtraces, paths, or private input in receipts.
    code = str(error) if isinstance(error, ValueError) else type(error).__name__
    if 'w' in globals() and isinstance(error, w.Trap): code = 'trap:'+str(error.trap_code)
    emit({'result': {'status': 'error', 'code': code[:120], 'phase': phase}})
