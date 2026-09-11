"""Closed-refuse helpers. Never describe a refuse as a payment or sale."""

from __future__ import annotations

import json
import sys
from typing import Any


class ClientRefuse(Exception):
    """Caller-facing refusal. Exit 2. Not a payment error."""

    def __init__(self, code: str, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra
        self.exit_code = 2

    def payload(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "ok": False,
            "refused": True,
            "code": self.code,
            "error": self.message,
            "sold": False,
            "purchaseAuthority": False,
            "payment": False,
            "extracted": bool(self.extra.get("extracted", False)),
            "executed": bool(self.extra.get("executed", False)),
        }
        for key, value in self.extra.items():
            body[key] = value
        return body


def emit(payload: dict[str, Any], exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    raise SystemExit(exit_code)


def emit_refuse(err: ClientRefuse) -> None:
    emit(err.payload(), err.exit_code)
