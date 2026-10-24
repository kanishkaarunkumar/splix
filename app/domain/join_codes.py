"""Short human-readable group invites; session/recovery tokens stay full length."""

from secrets import choice

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MAX_ATTEMPTS = 32


def new_join_code():
    return "".join(choice(ALPHABET) for _ in range(4))


def normalize_join_code(code):
    value = code.strip()
    if len(value) == 4:
        return value.upper()
    # Previously issued hexadecimal invitations remain usable until expiry.
    if len(value) in (16, 32) and all(c in "0123456789abcdefABCDEF" for c in value):
        return value.lower()
    return value
