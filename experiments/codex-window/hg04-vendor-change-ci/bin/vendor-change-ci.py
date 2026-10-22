#!/usr/bin/env python3
"""SDK-free Python entry point using the same validated CI decision path as Node.

The released useful-jobs engine already requires Node. Forwarding here keeps
baseline, coverage, arithmetic, and artifact safety identical across entry points.
"""
import os
import sys
from pathlib import Path

if __name__ == "__main__":
    entry = Path(__file__).resolve().with_suffix(".mjs")
    os.execvp("node", ["node", str(entry), *sys.argv[1:]])
