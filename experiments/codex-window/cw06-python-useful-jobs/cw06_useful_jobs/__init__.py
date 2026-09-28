"""Released SameDayDesk useful-jobs 1.4.0 interoperability consumer."""

from .consumer import (
    ARCHIVE_BYTES,
    ARCHIVE_SHA256,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    ConsumerRefusal,
    consume,
)

__all__ = [
    "ARCHIVE_BYTES",
    "ARCHIVE_SHA256",
    "REQUEST_SCHEMA",
    "RESULT_SCHEMA",
    "ConsumerRefusal",
    "consume",
]

