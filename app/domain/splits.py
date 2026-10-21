from dataclasses import dataclass
from .errors import DomainError

@dataclass(frozen=True)
class Share:
    user_id: str
    amount_paise: int

def _valid(total: int, count: int):
    if total <= 0 or count < 1: raise DomainError("INVALID_SPLIT", "Amount and participants must be positive.")

def equal_split(total: int, user_ids: list[str]) -> list[Share]:
    _valid(total, len(user_ids)); users = sorted(user_ids)
    if len(set(users)) != len(users): raise DomainError("INVALID_SPLIT", "Participants must be unique.")
    base, remainder = divmod(total, len(users)); return [Share(user, base + (i < remainder)) for i, user in enumerate(users)]

def percentage_split(total: int, percentages: list[tuple[str, int]]) -> list[Share]:
    _valid(total, len(percentages)); users = sorted(percentages)
    if len({u for u, _ in users}) != len(users) or any(not 0 <= b <= 10000 for _, b in users): raise DomainError("INVALID_SPLIT", "Percentages must be unique and valid.")
    if sum(b for _, b in users) != 10000: raise DomainError("INVALID_SPLIT", "Percentages must total 10000 basis points.")
    rows = [(u, total * b // 10000, total * b % 10000) for u, b in users]; left = total - sum(a for _, a, _ in rows)
    rows.sort(key=lambda row: (-row[2], row[0])); rows = [(u, a + (i < left), f) for i, (u, a, f) in enumerate(rows)]
    return [Share(u, a) for u, a, _ in sorted(rows)]

def exact_split(total: int, shares: list[Share]) -> list[Share]:
    _valid(total, len(shares))
    if len({s.user_id for s in shares}) != len(shares) or any(s.amount_paise < 0 for s in shares): raise DomainError("INVALID_SPLIT", "Exact shares must be unique and nonnegative.")
    if sum(s.amount_paise for s in shares) != total: raise DomainError("INVALID_SPLIT", "Exact shares must total the expense amount.")
    return sorted(shares, key=lambda s: s.user_id)
