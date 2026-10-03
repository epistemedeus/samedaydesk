"""Acquire the immutable public MIT client; never assess or prepare."""
import hashlib
import io
import json
import pathlib
import tarfile
import urllib.request

BASE = "https://ein.llc/downloads/"
NAME = "ein-activation-continuation-v0.1.3"
SHA = "1273c33e77aadef2eececd1d1c7269ef9c9205558c223adb2982e7517d523ad2"
ROOT = pathlib.Path(__file__).resolve().parents[1]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("redirect refused")


def read(name, ceiling):
    with urllib.request.build_opener(NoRedirect).open(BASE + name, timeout=15) as reply:
        body = reply.read(ceiling + 1)
        assert reply.status == 200 and len(body) <= ceiling
        return body


manifest = json.loads(read(NAME + ".json", 32768))
archive = read(NAME + ".tgz", 48615)
assert len(archive) == 48615 and hashlib.sha256(archive).hexdigest() == SHA
assert manifest["version"] == "0.1.3" and manifest["spdxLicense"] == "MIT"
expected = {entry["path"]: entry for entry in manifest["files"]}
assert len(expected) == 39
destination = ROOT / "vendor" / "ein-activation-continuation"
with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
    members = tar.getmembers()
    assert len(members) == 39
    seen = set()
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        assert path.parts[0] == "ein-activation-continuation"
        relative = str(pathlib.PurePosixPath(*path.parts[1:]))
        assert member.isfile() and ".." not in path.parts and relative in expected
        assert relative not in seen
        seen.add(relative)
        entry = expected[relative]
        body = tar.extractfile(member).read()
        assert len(body) == entry["bytes"] and hashlib.sha256(body).hexdigest() == entry["sha256"]
        output = destination / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            assert output.read_bytes() == body, "refuse to replace acquired source"
        else:
            output.write_bytes(body)
            output.chmod(entry["mode"])
assert seen == set(expected)
receipt = {
    "schema": "samedaydesk.relevant-activation.acquisition.v1",
    "source": "f380faad42638e18c31f53711001a8b567e3d273",
    "url": BASE + NAME + ".tgz", "version": "0.1.3", "license": "MIT",
    "bytes": len(archive), "members": len(seen), "sha256": SHA,
    "manifestPublished": manifest.get("published"),
    "hostedBytesReceived": True, "customerActivation": "not_observed",
    "files": manifest["files"],
}
(ROOT / "EIN-ACQUISITION.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: value for key, value in receipt.items() if key != "files"}))
