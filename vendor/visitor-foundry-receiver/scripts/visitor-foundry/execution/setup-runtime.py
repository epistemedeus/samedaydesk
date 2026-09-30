"""Install only the pinned official wheel in this subtree, without system pip."""
import hashlib, io, pathlib, platform, subprocess, sys, urllib.request, zipfile
ROOT = pathlib.Path(__file__).resolve().parent
WHEEL = 'https://files.pythonhosted.org/packages/6b/49/d62b41a6ae9063681bb6af018ff49b75d49f853bbf672c7ddebedf21d69e/wasmtime-49.0.0-py3-none-manylinux1_x86_64.whl'
SHA = '94f0288f9e1c33924995a72bb769f4c4e2885002391589dd6992cdaa35d1990a'
assert sys.platform == 'linux' and platform.machine() == 'x86_64', 'profile requires Linux x86_64'
with urllib.request.urlopen(WHEEL, timeout=30) as response:
    data = response.read(11 * 1024 * 1024)
assert hashlib.sha256(data).hexdigest() == SHA, 'wheel checksum mismatch'
subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(ROOT / '.runtime')], check=True)
python = ROOT / '.runtime/bin/python'
site = pathlib.Path(subprocess.check_output([str(python), '-I', '-c', 'import sysconfig;print(sysconfig.get_path("purelib"))'], text=True).strip())
with zipfile.ZipFile(io.BytesIO(data)) as wheel:
    for name in wheel.namelist():
        assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
    wheel.extractall(site)
subprocess.run([str(python), '-I', '-c', 'import wasmtime,importlib.metadata;print("Wasmtime",importlib.metadata.version("wasmtime"))'], check=True)
