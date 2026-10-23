"""Shared expense validation/allocation for memory and PostgreSQL adapters."""

import re

from .errors import DomainError
from .splits import Share, equal_split, exact_split, percentage_split, weighted_split


def prepare_expense(member_ids, data):
    # Financial amount/date validation is performed by the service before allocation.
    amount = int(data["amountPaise"])
    method = data.get("splitMethod")
    if data["payerId"] not in member_ids:
        raise DomainError("FORBIDDEN", "User must belong to the group.")
    if method not in ("equal", "percentage", "weighted", "exact"):
        raise DomainError("INVALID_SPLIT", "Choose a supported split method.")
    if not str(data.get("title", "")).strip() or len(data["title"]) > 120:
        raise DomainError("INVALID_INPUT", "Expense title must contain 1 to 120 characters.")
    if not str(data.get("category", "")).strip() or len(data["category"]) > 80:
        raise DomainError("INVALID_INPUT", "Category must contain 1 to 80 characters.")
    if len(str(data.get("note", ""))) > 1000:
        raise DomainError("INVALID_INPUT", "Note must be at most 1000 characters.")
    field = {
        "equal": "participantIds",
        "percentage": "percentages",
        "weighted": "weights",
        "exact": "shares",
    }[method]
    ids = data.get(field, []) if method == "equal" else [x["userId"] for x in data.get(field, [])]
    for item in data.get("percentages", []) + data.get("weights", []):
        if type(item.get("basisPoints", item.get("weight"))) is not int:
            raise DomainError("INVALID_SPLIT", "Weights and basis points must be integers.")
    for item in data.get("shares", []):
        if not re.fullmatch(r"[0-9]+", str(item.get("amountPaise", ""))):
            raise DomainError("INVALID_SPLIT", "Shares must be integer paise.")
    if any(user not in member_ids for user in ids):
        raise DomainError("FORBIDDEN", "User must belong to the group.")
    if method == "equal":
        shares = equal_split(amount, ids)
    elif method == "percentage":
        shares = percentage_split(
            amount, [(x["userId"], x["basisPoints"]) for x in data.get(field, [])]
        )
    elif method == "weighted":
        shares = weighted_split(amount, [(x["userId"], x["weight"]) for x in data.get(field, [])])
    else:
        shares = exact_split(
            amount, [Share(x["userId"], int(x["amountPaise"])) for x in data.get(field, [])]
        )
    return amount, shares
