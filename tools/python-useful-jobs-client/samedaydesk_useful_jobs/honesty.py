"""SAMPLE / --example is never a sale. This client has no payment path."""

from __future__ import annotations

from typing import Iterable

from .refuse import ClientRefuse

SALE_FLAGS = frozenset(
    {
        "--sold",
        "--sale",
        "--as-sale",
        "--settle",
        "--live-sale",
        "--live-settle",
    }
)
SALE_INTENT_VALUES = frozenset({"sale", "live-sale", "sold", "settle", "live-settle"})


def inspect_argv(argv: Iterable[str]) -> tuple[bool, tuple[str, ...], list[str]]:
    """Return (example, sale_reasons, argv_for_node). Sale flags are not forwarded."""
    args = list(argv)
    example = False
    sale_reasons: list[str] = []
    passthrough: list[str] = []
    i = 0
    while i < len(args):
        item = args[i]
        if item == "--example" or item.startswith("--example="):
            example = True
            passthrough.append(item)
            i += 1
            continue
        flag_name = item.split("=", 1)[0]
        if item in SALE_FLAGS or flag_name in SALE_FLAGS:
            sale_reasons.append(item)
            i += 1
            continue
        if item == "--funding-intent":
            value = args[i + 1] if i + 1 < len(args) else ""
            if value in SALE_INTENT_VALUES:
                sale_reasons.append(f"--funding-intent {value}")
                i += 2
                continue
            passthrough.append(item)
            if i + 1 < len(args):
                passthrough.append(args[i + 1])
                i += 2
            else:
                i += 1
            continue
        if item.startswith("--funding-intent="):
            value = item.split("=", 1)[1]
            if value in SALE_INTENT_VALUES:
                sale_reasons.append(item)
                i += 1
                continue
        passthrough.append(item)
        i += 1
    return example, tuple(sale_reasons), passthrough


def refuse_sale_intent(example: bool, sale_reasons: tuple[str, ...]) -> None:
    if not sale_reasons:
        return
    if example:
        raise ClientRefuse(
            "sample-as-sale",
            "SAMPLE --example is a labeled fixture, not a sold job or live sale. "
            "This client has no payment path.",
            label="SAMPLE",
            sample=True,
            saleReasons=list(sale_reasons),
            kind="fixture",
        )
    raise ClientRefuse(
        "no-payment",
        "This Python client has no payment path and cannot mark a useful-jobs run sold.",
        label="no-payment",
        saleReasons=list(sale_reasons),
    )


def sample_envelope(example: bool) -> dict:
    if example:
        return {
            "sample": True,
            "label": "SAMPLE",
            "sold": False,
            "purchaseAuthority": False,
            "kind": "fixture",
        }
    return {
        "sample": False,
        "label": "caller-input",
        "sold": False,
        "purchaseAuthority": False,
        "kind": "local-runtime",
    }
