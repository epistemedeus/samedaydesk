"""Build only the wrapper package, never an old pyz, tests, or caller outputs."""

import argparse
import shutil
import tempfile
import zipapp
from pathlib import Path


def build(output: Path) -> None:
    package = Path(__file__).resolve().parent / "cw06_useful_jobs"
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cw06-build-") as work:
        stage = Path(work)
        shutil.copytree(package, stage / package.name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        zipapp.create_archive(stage, output, interpreter="/usr/bin/env python3", main="cw06_useful_jobs.consumer:main", compressed=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
