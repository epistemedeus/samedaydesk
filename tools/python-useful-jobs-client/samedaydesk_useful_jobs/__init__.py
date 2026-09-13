"""Importable SameDayDesk useful-jobs client (Python 3 stdlib only)."""

from .acquire import acquire
from .jobs import help_job, list_jobs, run_job
from .pins import HASH_TERMS, JOB_IDS, load_packaged_pins

__all__ = [
    "HASH_TERMS",
    "JOB_IDS",
    "acquire",
    "help_job",
    "list_jobs",
    "run_job",
    "load_packaged_pins",
]
__version__ = "1.1.0"
