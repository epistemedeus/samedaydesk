/* Distinct Wasmtime 49.0.0 C API embedding. Not the wasmtime-py reference profile,
 * not WASI, and not the host JavaScript engine. One request on stdin, one result
 * on stdout. Resource limits are applied before any guest bytes are read. */
#define _POSIX_C_SOURCE 200809L
#include <wasmtime.h>

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

#define PIN "49.0.0"
#define REQUEST_MAX 450000

extern char **environ;

static const char *phase = "startup";
static char code_buf[128];

static void emit_raw(const char *json) {
  fputs(json, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

static void fail(const char *code) {
  char line[256];
  snprintf(line, sizeof line, "{\"result\":{\"status\":\"error\",\"code\":\"%s\",\"phase\":\"%s\"}}", code, phase);
  emit_raw(line);
  exit(0);
}

static void require(int ok, const char *code) {
  if (!ok) fail(code);
}

static double mono_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}

static void set_both(int resource, rlim_t value) {
  struct rlimit limit;
  limit.rlim_cur = value;
  limit.rlim_max = value;
  if (setrlimit(resource, &limit) != 0) fail("os_limits_unavailable");
}

static void expect_both(int resource, rlim_t value) {
  struct rlimit limit;
  require(getrlimit(resource, &limit) == 0, "os_limits_unavailable");
  require(limit.rlim_cur == value && limit.rlim_max == value, "os_limits_unavailable");
}

typedef struct {
  const char *data;
  size_t len;
  size_t pos;
} Reader;

static uint8_t rd_byte(Reader *r) {
  require(r->pos < r->len, "truncated_module");
  return (uint8_t)r->data[r->pos++];
}

static uint32_t rd_uint(Reader *r) {
  uint32_t value = 0;
  for (int i = 0; i < 5; i++) {
    uint8_t b = rd_byte(r);
    value |= (uint32_t)(b & 127) << (7 * i);
    if (b < 128) {
      require(value <= 0xffffffffu, "invalid_leb");
      return value;
    }
  }
  fail("invalid_leb");
  return 0;
}

static Reader rd_take(Reader *r, uint32_t n) {
  require(n <= r->len - r->pos, "truncated_module");
  Reader part = { r->data + r->pos, n, 0 };
  r->pos += n;
  return part;
}

static void fixed_limits(Reader *r, uint32_t cap) {
  require(rd_byte(r) == 1, "fixed_limits_required");
  uint32_t minimum = rd_uint(r);
  uint32_t maximum = rd_uint(r);
  require(minimum == maximum && maximum <= cap, "fixed_resource_limit");
}

static void admission(const uint8_t *module, size_t len, uint32_t memory_bytes, uint32_t table_elements) {
  require(len >= 8 && memcmp(module, "\0asm\x01\0\0\0", 8) == 0, "binary_core_wasm_required");
  Reader r = { (const char *)module + 8, len - 8, 0 };
  uint32_t memories = 0, tables = 0;
  while (r.pos < r.len) {
    uint8_t section = rd_byte(&r);
    Reader part = rd_take(&r, rd_uint(&r));
    require(section <= 12, "unsupported_section");
    if (section == 2) require(rd_uint(&part) == 0, "imports_forbidden");
    if (section == 4) {
      uint32_t count = rd_uint(&part);
      tables += count;
      require(tables <= 1, "table_count");
      for (uint32_t i = 0; i < count; i++) {
        require(rd_byte(&part) == 0x70, "funcref_only");
        fixed_limits(&part, table_elements);
      }
    }
    if (section == 5) {
      uint32_t count = rd_uint(&part);
      memories += count;
      require(memories == 1, "memory_count");
      fixed_limits(&part, memory_bytes / 65536);
    }
    if (section == 2 || section == 4 || section == 5) require(part.pos == part.len, "section_trailing_data");
  }
  require(memories == 1, "one_memory_required");
}

static uint32_t rotr(uint32_t x, uint32_t n) { return (x >> n) | (x << (32 - n)); }

static void sha256(const uint8_t *data, size_t len, uint8_t out[32]) {
  static const uint32_t k[64] = {
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  };
  uint32_t h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  uint32_t h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  size_t blocks = (len + 8) / 64 + 1;
  uint8_t *buf = calloc(blocks, 64);
  require(buf != NULL, "host_memory");
  memcpy(buf, data, len);
  buf[len] = 0x80;
  uint64_t bits = (uint64_t)len * 8;
  for (int i = 0; i < 8; i++) buf[blocks * 64 - 1 - i] = (uint8_t)(bits >> (8 * i));
  for (size_t b = 0; b < blocks; b++) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) {
      size_t o = b * 64 + (size_t)i * 4;
      w[i] = ((uint32_t)buf[o] << 24) | ((uint32_t)buf[o + 1] << 16) | ((uint32_t)buf[o + 2] << 8) | buf[o + 3];
    }
    for (int i = 16; i < 64; i++) {
      uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
      uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h0, b0 = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (int i = 0; i < 64; i++) {
      uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      uint32_t ch = (e & f) ^ ((~e) & g);
      uint32_t t1 = h + S1 + ch + k[i] + w[i];
      uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      uint32_t maj = (a & b0) ^ (a & c) ^ (b0 & c);
      uint32_t t2 = S0 + maj;
      h = g; g = f; f = e; e = d + t1; d = c; c = b0; b0 = a; a = t1 + t2;
    }
    h0 += a; h1 += b0; h2 += c; h3 += d; h4 += e; h5 += f; h6 += g; h7 += h;
  }
  free(buf);
  uint32_t hs[8] = { h0, h1, h2, h3, h4, h5, h6, h7 };
  for (int i = 0; i < 8; i++) {
    out[i * 4] = (uint8_t)(hs[i] >> 24);
    out[i * 4 + 1] = (uint8_t)(hs[i] >> 16);
    out[i * 4 + 2] = (uint8_t)(hs[i] >> 8);
    out[i * 4 + 3] = (uint8_t)hs[i];
  }
}

static int b64_val(int c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

static uint8_t *b64_decode(const char *text, size_t len, size_t *out_len) {
  require(len % 4 == 0, "invalid_base64");
  size_t pads = 0;
  if (len >= 1 && text[len - 1] == '=') pads++;
  if (len >= 2 && text[len - 2] == '=') pads++;
  require(pads <= 2, "invalid_base64");
  size_t full = len / 4;
  *out_len = full * 3 - pads;
  uint8_t *out = calloc(*out_len + 1, 1);
  require(out != NULL, "host_memory");
  size_t w = 0;
  for (size_t i = 0; i < full; i++) {
    int v[4];
    for (int j = 0; j < 4; j++) {
      char c = text[i * 4 + j];
      if (c == '=') {
        require(i + 1 == full && j >= 2, "invalid_base64");
        v[j] = 0;
      } else {
        v[j] = b64_val((unsigned char)c);
        require(v[j] >= 0, "invalid_base64");
      }
    }
    if (i + 1 == full && pads) {
      if (pads == 1) require(text[len - 1] == '=' && text[len - 2] != '=', "invalid_base64");
      if (pads == 2) require(text[len - 1] == '=' && text[len - 2] == '=', "invalid_base64");
    }
    uint32_t n = ((uint32_t)v[0] << 18) | ((uint32_t)v[1] << 12) | ((uint32_t)v[2] << 6) | (uint32_t)v[3];
    if (w < *out_len) out[w++] = (uint8_t)(n >> 16);
    if (w < *out_len) out[w++] = (uint8_t)(n >> 8);
    if (w < *out_len) out[w++] = (uint8_t)n;
  }
  return out;
}

static char *b64_encode(const uint8_t *data, size_t len) {
  static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t out_len = ((len + 2) / 3) * 4;
  char *out = calloc(out_len + 1, 1);
  require(out != NULL, "host_memory");
  size_t w = 0;
  for (size_t i = 0; i < len; i += 3) {
    uint32_t n = (uint32_t)data[i] << 16;
    if (i + 1 < len) n |= (uint32_t)data[i + 1] << 8;
    if (i + 2 < len) n |= data[i + 2];
    out[w++] = table[(n >> 18) & 63];
    out[w++] = table[(n >> 12) & 63];
    out[w++] = i + 1 < len ? table[(n >> 6) & 63] : '=';
    out[w++] = i + 2 < len ? table[n & 63] : '=';
  }
  out[w] = 0;
  return out;
}

typedef struct {
  const char *p;
  const char *end;
} Json;

static void jskip(Json *j) {
  while (j->p < j->end && (*j->p == ' ' || *j->p == '\n' || *j->p == '\r' || *j->p == '\t')) j->p++;
}

static void jexpect(Json *j, char c) {
  jskip(j);
  require(j->p < j->end && *j->p == c, "invalid_request");
  j->p++;
}

static char *jstring(Json *j) {
  jskip(j);
  require(j->p < j->end && *j->p == '"', "invalid_request");
  j->p++;
  size_t cap = 64, n = 0;
  char *out = malloc(cap);
  require(out != NULL, "host_memory");
  while (j->p < j->end && *j->p != '"') {
    unsigned char c = (unsigned char)*j->p++;
    if (c == '\\') {
      require(j->p < j->end, "invalid_request");
      char e = *j->p++;
      if (e == '"' || e == '\\' || e == '/') c = (unsigned char)e;
      else if (e == 'n') c = '\n';
      else if (e == 't') c = '\t';
      else if (e == 'r') c = '\r';
      else fail("invalid_request");
    }
    if (n + 1 >= cap) {
      cap *= 2;
      char *next = realloc(out, cap);
      require(next != NULL, "host_memory");
      out = next;
    }
    out[n++] = (char)c;
  }
  require(j->p < j->end && *j->p == '"', "invalid_request");
  j->p++;
  out[n] = 0;
  return out;
}

static uint64_t juint(Json *j) {
  jskip(j);
  require(j->p < j->end && *j->p >= '0' && *j->p <= '9', "invalid_request");
  uint64_t value = 0;
  while (j->p < j->end && *j->p >= '0' && *j->p <= '9') {
    value = value * 10 + (uint64_t)(*j->p - '0');
    j->p++;
  }
  return value;
}

static int jkey_is(const char *key, const char *want) { return strcmp(key, want) == 0; }

typedef struct {
  uint64_t moduleBytes, inputBytes, outputBytes, memoryBytes, tableElements, stackBytes, fuel;
  uint64_t addressSpaceBytes, cpuSeconds, hostStackBytes, fileBytes, openFiles;
  int saw;
} Limits;

static int limit_bit(const char *key) {
  const char *names[] = {
    "moduleBytes", "inputBytes", "outputBytes", "memoryBytes", "tableElements", "stackBytes", "fuel",
    "addressSpaceBytes", "cpuSeconds", "hostStackBytes", "fileBytes", "openFiles"
  };
  for (int i = 0; i < 12; i++) if (jkey_is(key, names[i])) return 1 << i;
  return 0;
}

static void assign_limit(Limits *limits, const char *key, uint64_t value) {
  if (jkey_is(key, "moduleBytes")) limits->moduleBytes = value;
  else if (jkey_is(key, "inputBytes")) limits->inputBytes = value;
  else if (jkey_is(key, "outputBytes")) limits->outputBytes = value;
  else if (jkey_is(key, "memoryBytes")) limits->memoryBytes = value;
  else if (jkey_is(key, "tableElements")) limits->tableElements = value;
  else if (jkey_is(key, "stackBytes")) limits->stackBytes = value;
  else if (jkey_is(key, "fuel")) limits->fuel = value;
  else if (jkey_is(key, "addressSpaceBytes")) limits->addressSpaceBytes = value;
  else if (jkey_is(key, "cpuSeconds")) limits->cpuSeconds = value;
  else if (jkey_is(key, "hostStackBytes")) limits->hostStackBytes = value;
  else if (jkey_is(key, "fileBytes")) limits->fileBytes = value;
  else if (jkey_is(key, "openFiles")) limits->openFiles = value;
}

static uint64_t take_argv(const char *flag, int argc, char **argv) {
  size_t n = strlen(flag);
  for (int i = 1; i < argc; i++) {
    if (strncmp(argv[i], flag, n) == 0 && argv[i][n] == '=') {
      char *end = NULL;
      unsigned long long value = strtoull(argv[i] + n + 1, &end, 10);
      require(end && *end == 0, "os_limits_unavailable");
      return (uint64_t)value;
    }
  }
  fail("os_limits_unavailable");
  return 0;
}

static const char *trap_name(wasmtime_trap_code_t code) {
  switch (code) {
    case WASMTIME_TRAP_CODE_STACK_OVERFLOW: return "TrapCode.STACK_OVERFLOW";
    case WASMTIME_TRAP_CODE_MEMORY_OUT_OF_BOUNDS: return "TrapCode.MEMORY_OUT_OF_BOUNDS";
    case WASMTIME_TRAP_CODE_HEAP_MISALIGNED: return "TrapCode.HEAP_MISALIGNED";
    case WASMTIME_TRAP_CODE_TABLE_OUT_OF_BOUNDS: return "TrapCode.TABLE_OUT_OF_BOUNDS";
    case WASMTIME_TRAP_CODE_INDIRECT_CALL_TO_NULL: return "TrapCode.INDIRECT_CALL_TO_NULL";
    case WASMTIME_TRAP_CODE_BAD_SIGNATURE: return "TrapCode.BAD_SIGNATURE";
    case WASMTIME_TRAP_CODE_INTEGER_OVERFLOW: return "TrapCode.INTEGER_OVERFLOW";
    case WASMTIME_TRAP_CODE_INTEGER_DIVISION_BY_ZERO: return "TrapCode.INTEGER_DIVISION_BY_ZERO";
    case WASMTIME_TRAP_CODE_BAD_CONVERSION_TO_INTEGER: return "TrapCode.BAD_CONVERSION_TO_INTEGER";
    case WASMTIME_TRAP_CODE_UNREACHABLE_CODE_REACHED: return "TrapCode.UNREACHABLE";
    case WASMTIME_TRAP_CODE_INTERRUPT: return "TrapCode.INTERRUPT";
    case WASMTIME_TRAP_CODE_OUT_OF_FUEL: return "TrapCode.OUT_OF_FUEL";
    default: return "TrapCode.UNKNOWN";
  }
}

static void fail_trap(wasm_trap_t *trap) {
  wasmtime_trap_code_t code = 0;
  const char *name = "TrapCode.UNKNOWN";
  if (trap && wasmtime_trap_code(trap, &code)) name = trap_name(code);
  snprintf(code_buf, sizeof code_buf, "trap:%s", name);
  if (trap) wasm_trap_delete(trap);
  fail(code_buf);
}

static int kinds_equal(const wasm_valtype_vec_t *types, const wasm_valkind_t *want, size_t n) {
  if (types->size != n) return 0;
  for (size_t i = 0; i < n; i++) if (wasm_valtype_kind(types->data[i]) != want[i]) return 0;
  return 1;
}

int main(int argc, char **argv) {
  require(strcmp(PIN, "49.0.0") == 0, "runtime_version");
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--probe") == 0) {
      emit_raw("{\"probe\":\"wasmtime49-embed\",\"version\":\"49.0.0\",\"runtime\":\"wasmtime-capi\",\"wasi\":false,\"ok\":true}");
      return 0;
    }
  }
  uint64_t as_bytes = take_argv("--as", argc, argv);
  uint64_t cpu_seconds = take_argv("--cpu", argc, argv);
  uint64_t stack_bytes = take_argv("--stack", argc, argv);
  uint64_t file_bytes = take_argv("--fsize", argc, argv);
  uint64_t open_files = take_argv("--nofile", argc, argv);
  set_both(RLIMIT_AS, (rlim_t)as_bytes);
  set_both(RLIMIT_CPU, (rlim_t)cpu_seconds);
  set_both(RLIMIT_STACK, (rlim_t)stack_bytes);
  set_both(RLIMIT_FSIZE, (rlim_t)file_bytes);
  set_both(RLIMIT_NOFILE, (rlim_t)open_files);
  set_both(RLIMIT_CORE, 0);
  expect_both(RLIMIT_AS, (rlim_t)as_bytes);
  expect_both(RLIMIT_CPU, (rlim_t)cpu_seconds);
  expect_both(RLIMIT_STACK, (rlim_t)stack_bytes);
  expect_both(RLIMIT_FSIZE, (rlim_t)file_bytes);
  expect_both(RLIMIT_NOFILE, (rlim_t)open_files);
  expect_both(RLIMIT_CORE, 0);

  char *line = malloc(REQUEST_MAX + 1);
  require(line != NULL, "host_memory");
  size_t got = 0;
  int saw_nl = 0;
  while (got < REQUEST_MAX) {
    int c = getchar();
    if (c == EOF) break;
    line[got++] = (char)c;
    if (c == '\n') { saw_nl = 1; break; }
  }
  require(saw_nl && got > 1 && got < REQUEST_MAX, "request_size");
  line[got] = 0;

  for (char **env = environ; env && *env; env++) {
    const char *key = *env;
    const char *eq = strchr(key, '=');
    size_t n = eq ? (size_t)(eq - key) : strlen(key);
    int allowed = (n == 4 && strncmp(key, "LANG", 4) == 0)
      || (n == 6 && strncmp(key, "LC_ALL", 6) == 0)
      || (n == 8 && strncmp(key, "LC_CTYPE", 8) == 0);
    require(allowed, "inherited_environment");
  }

  Json j = { line, line + got - 1 };
  jexpect(&j, '{');
  char *module_b64 = NULL, *digest = NULL, *input_b64 = NULL;
  Limits limits;
  memset(&limits, 0, sizeof limits);
  int first = 1;
  while (1) {
    jskip(&j);
    if (j.p < j.end && *j.p == '}') { j.p++; break; }
    if (!first) jexpect(&j, ',');
    first = 0;
    char *key = jstring(&j);
    jexpect(&j, ':');
    if (jkey_is(key, "module")) module_b64 = jstring(&j);
    else if (jkey_is(key, "moduleDigest")) digest = jstring(&j);
    else if (jkey_is(key, "input")) input_b64 = jstring(&j);
    else if (jkey_is(key, "limits")) {
      jexpect(&j, '{');
      int lf = 1;
      while (1) {
        jskip(&j);
        if (j.p < j.end && *j.p == '}') { j.p++; break; }
        if (!lf) jexpect(&j, ',');
        lf = 0;
        char *lk = jstring(&j);
        jexpect(&j, ':');
        int bit = limit_bit(lk);
        if (bit) {
          uint64_t value = juint(&j);
          assign_limit(&limits, lk, value);
          limits.saw |= bit;
        } else {
          jskip(&j);
          require(j.p < j.end && *j.p >= '0' && *j.p <= '9', "invalid_request");
          juint(&j);
        }
        free(lk);
      }
    } else {
      fail("invalid_request");
    }
    free(key);
  }
  jskip(&j);
  require(j.p == j.end, "invalid_request");
  require(module_b64 && digest && input_b64, "invalid_request");
  require(limits.saw == 0xfff, "invalid_request");
  require(limits.addressSpaceBytes == as_bytes && limits.cpuSeconds == cpu_seconds
    && limits.hostStackBytes == stack_bytes && limits.fileBytes == file_bytes
    && limits.openFiles == open_files, "os_limits_unavailable");
  require(limits.memoryBytes % 65536 == 0 && limits.memoryBytes >= 65536, "fixed_resource_limit");

  size_t module_len = 0, input_len = 0;
  uint8_t *module_bytes = b64_decode(module_b64, strlen(module_b64), &module_len);
  uint8_t *input = b64_decode(input_b64, strlen(input_b64), &input_len);
  require(module_len <= limits.moduleBytes && input_len <= limits.inputBytes, "payload_size");
  uint8_t dig[32];
  sha256(module_bytes, module_len, dig);
  char hex[80];
  strcpy(hex, "sha256:");
  for (int i = 0; i < 32; i++) sprintf(hex + 7 + i * 2, "%02x", dig[i]);
  require(strcmp(hex, digest) == 0, "module_digest");

  phase = "compile";
  emit_raw("{\"phase\":\"compile\"}");
  double compile_start = mono_ms();
  admission(module_bytes, module_len, (uint32_t)limits.memoryBytes, (uint32_t)limits.tableElements);
  wasm_config_t *config = wasm_config_new();
  require(config != NULL, "engine_error");
  wasmtime_config_consume_fuel_set(config, true);
  wasmtime_config_parallel_compilation_set(config, false);
  wasmtime_config_cranelift_nan_canonicalization_set(config, true);
  wasmtime_config_max_wasm_stack_set(config, (size_t)limits.stackBytes);
  wasmtime_config_memory_reservation_set(config, limits.memoryBytes);
  wasmtime_config_memory_reservation_for_growth_set(config, 0);
  wasmtime_config_memory_guard_size_set(config, 65536);
  wasmtime_config_memory_init_cow_set(config, false);
  wasmtime_config_wasm_threads_set(config, false);
  wasmtime_config_shared_memory_set(config, false);
  wasmtime_config_wasm_memory64_set(config, false);
  wasmtime_config_wasm_multi_memory_set(config, false);
  wasmtime_config_wasm_simd_set(config, false);
  wasmtime_config_wasm_relaxed_simd_set(config, false);
  wasmtime_config_wasm_component_model_set(config, false);
  wasmtime_config_wasm_gc_set(config, false);
  wasmtime_config_wasm_function_references_set(config, false);
  wasmtime_config_wasm_exceptions_set(config, false);
  wasmtime_config_wasm_stack_switching_set(config, false);
  wasmtime_config_wasm_tail_call_set(config, false);
  wasmtime_config_wasm_custom_page_sizes_set(config, false);
  wasmtime_config_wasm_wide_arithmetic_set(config, false);
  wasm_engine_t *engine = wasm_engine_new_with_config(config);
  require(engine != NULL, "engine_error");
  wasmtime_module_t *module = NULL;
  wasmtime_error_t *error = wasmtime_module_new(engine, module_bytes, module_len, &module);
  if (error) { wasmtime_error_delete(error); fail("engine_error"); }
  double compile_ms = mono_ms() - compile_start;
  wasm_importtype_vec_t imports;
  wasmtime_module_imports(module, &imports);
  int import_count = (int)imports.size;
  wasm_importtype_vec_delete(&imports);
  require(import_count == 0, "imports_forbidden");

  phase = "instantiate";
  emit_raw("{\"phase\":\"instantiate\"}");
  double instance_start = mono_ms();
  wasmtime_store_t *store = wasmtime_store_new(engine, NULL, NULL);
  require(store != NULL, "engine_error");
  wasmtime_store_limiter(store, (int64_t)limits.memoryBytes, (int64_t)limits.tableElements, 1, 1, 1);
  wasmtime_context_t *ctx = wasmtime_store_context(store);
  error = wasmtime_context_set_fuel(ctx, limits.fuel);
  if (error) { wasmtime_error_delete(error); fail("engine_error"); }
  wasmtime_instance_t instance;
  wasm_trap_t *trap = NULL;
  error = wasmtime_instance_new(ctx, module, NULL, 0, &instance, &trap);
  if (error) { wasmtime_error_delete(error); fail("engine_error"); }
  if (trap) fail_trap(trap);
  double instantiate_ms = mono_ms() - instance_start;

  int exports = 0;
  wasmtime_extern_t memory_ext, alloc_ext, transform_ext;
  memset(&memory_ext, 0, sizeof memory_ext);
  memset(&alloc_ext, 0, sizeof alloc_ext);
  memset(&transform_ext, 0, sizeof transform_ext);
  for (size_t i = 0;; i++) {
    char *name = NULL;
    size_t name_len = 0;
    wasmtime_extern_t item;
    if (!wasmtime_instance_export_nth(ctx, &instance, i, &name, &name_len, &item)) break;
    exports++;
    if (name_len == 6 && memcmp(name, "memory", 6) == 0) memory_ext = item;
    else if (name_len == 5 && memcmp(name, "alloc", 5) == 0) alloc_ext = item;
    else if (name_len == 9 && memcmp(name, "transform", 9) == 0) transform_ext = item;
    else fail("abi_exports");
  }
  require(exports == 3 && memory_ext.kind == WASMTIME_EXTERN_MEMORY
    && alloc_ext.kind == WASMTIME_EXTERN_FUNC && transform_ext.kind == WASMTIME_EXTERN_FUNC, "abi_exports");
  wasm_functype_t *alloc_type = wasmtime_func_type(ctx, &alloc_ext.of.func);
  wasm_functype_t *transform_type = wasmtime_func_type(ctx, &transform_ext.of.func);
  const wasm_valkind_t i32_one[] = { WASM_I32 };
  const wasm_valkind_t i32_two[] = { WASM_I32, WASM_I32 };
  const wasm_valkind_t i64_one[] = { WASM_I64 };
  require(kinds_equal(wasm_functype_params(alloc_type), i32_one, 1)
    && kinds_equal(wasm_functype_results(alloc_type), i32_one, 1), "alloc_signature");
  require(kinds_equal(wasm_functype_params(transform_type), i32_two, 2)
    && kinds_equal(wasm_functype_results(transform_type), i64_one, 1), "transform_signature");
  wasm_functype_delete(alloc_type);
  wasm_functype_delete(transform_type);

  phase = "execute";
  emit_raw("{\"phase\":\"execute\"}");
  double execute_start = mono_ms();
  wasmtime_val_t alloc_arg = { .kind = WASMTIME_I32, .of = { .i32 = (int32_t)input_len } };
  wasmtime_val_t alloc_result;
  trap = NULL;
  error = wasmtime_func_call(ctx, &alloc_ext.of.func, &alloc_arg, 1, &alloc_result, 1, &trap);
  if (error) { wasmtime_error_delete(error); fail("engine_error"); }
  if (trap) fail_trap(trap);
  uint32_t pointer = (uint32_t)alloc_result.of.i32;
  size_t size = wasmtime_memory_data_size(ctx, &memory_ext.of.memory);
  require((size_t)pointer <= size && input_len <= size - pointer, "input_pointer");
  memcpy(wasmtime_memory_data(ctx, &memory_ext.of.memory) + pointer, input, input_len);
  wasmtime_val_t transform_args[2] = {
    { .kind = WASMTIME_I32, .of = { .i32 = (int32_t)pointer } },
    { .kind = WASMTIME_I32, .of = { .i32 = (int32_t)input_len } }
  };
  wasmtime_val_t transform_result;
  trap = NULL;
  error = wasmtime_func_call(ctx, &transform_ext.of.func, transform_args, 2, &transform_result, 1, &trap);
  if (error) { wasmtime_error_delete(error); fail("engine_error"); }
  if (trap) fail_trap(trap);
  uint64_t packed = (uint64_t)transform_result.of.i64;
  uint32_t out_pointer = (uint32_t)packed;
  uint32_t length = (uint32_t)(packed >> 32);
  require(length <= limits.outputBytes, "output_size");
  size = wasmtime_memory_data_size(ctx, &memory_ext.of.memory);
  require((size_t)out_pointer <= size && (size_t)length <= size - out_pointer, "output_pointer");
  uint8_t *output = wasmtime_memory_data(ctx, &memory_ext.of.memory) + out_pointer;
  char *encoded = b64_encode(output, length);
  struct rusage usage;
  getrusage(RUSAGE_SELF, &usage);
  uint64_t remaining = 0;
  error = wasmtime_context_get_fuel(ctx, &remaining);
  if (error) { wasmtime_error_delete(error); fail("engine_error"); }
  uint64_t fuel_used = limits.fuel - remaining;
  double cpu_ms = ((double)usage.ru_utime.tv_sec + (double)usage.ru_stime.tv_sec) * 1000.0
    + ((double)usage.ru_utime.tv_usec + (double)usage.ru_stime.tv_usec) / 1000.0;
  double execute_ms = mono_ms() - execute_start;
  printf("{\"result\":{\"status\":\"ok\",\"output\":\"%s\",\"usage\":{\"cpuMs\":%.6f,\"peakRssBytes\":%ld,\"fuelUsed\":%llu,\"compileMs\":%.6f,\"instantiateMs\":%.6f,\"executeMs\":%.6f}}}\n",
    encoded, cpu_ms, usage.ru_maxrss * 1024L, (unsigned long long)fuel_used, compile_ms, instantiate_ms, execute_ms);
  fflush(stdout);
  free(encoded);
  return 0;
}
