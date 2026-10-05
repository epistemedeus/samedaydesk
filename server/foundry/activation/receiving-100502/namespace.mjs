// VM acceptance only. Hide optional host utilities in a private mount namespace;
// never remove binaries or alter mounts in the parent/managed-host environment.
import { access, copyFile, cp, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBounded } from "../../bounded-child.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const execution = path.join(root, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution");
export async function npmCli() {
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    const file = path.join(directory, "npm");
    try { await access(file); return await realpath(file); } catch {}
  }
  throw new Error("npm_unavailable");
}
export async function withoutHostUtilities(args, { fresh = false, timeoutMs = 180000 } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "sds-platform-100502-"));
  const tools = path.join(directory, "tools");
  await mkdir(tools);
  try {
    // Installer/build utilities remain available; python/python3/prlimit are absent.
    for (const name of ["sh", "env", "mount", "tar", "gzip", "mv", "clang", "locale", "git"]) {
      await copyFile(await realpath(`/usr/bin/${name}`), path.join(tools, name));
    }
    await symlink(await npmCli(), path.join(tools, "npm"));
    if (fresh) await cp(execution, path.join(directory, "execution"), { recursive: true,
      filter: file => ![".runtime", ".python-standalone"].includes(path.basename(file)) });
    const script = [
      '"$1/mount" --make-rprivate / || exit 90',
      '"$1/mount" --bind "$1" /usr/bin || exit 90',
      'if [ "$2" = fresh ]; then',
      '  "$1/mount" --bind "$3/execution" "$4" || exit 90',
      'fi',
      'shift 4',
      'exec "$@"',
    ].join("\n");
    return await runBounded("/usr/bin/unshare", ["--user", "--map-current-user", "--keep-caps", "--mount", "--",
      path.join(tools, "sh"), "-c", script, "namespace", tools, fresh ? "fresh" : "existing", directory, execution, process.execPath, ...args],
    { cwd: root, env: { PATH: `${tools}:${path.dirname(process.execPath)}`, HOME: directory, LANG: "C", LC_ALL: "C",
      FOUNDRY_CPYTHON_TARBALL: "/tmp/cpython-standalone.tar.gz" }, capture: true, stdoutLimit: 512000,
      outputLimit: 2 * 1024 * 1024, timeoutMs });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
