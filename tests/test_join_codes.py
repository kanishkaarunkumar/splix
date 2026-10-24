from datetime import UTC, datetime

import pytest

from app.domain.errors import DomainError
from app.domain.join_codes import ALPHABET, new_join_code, normalize_join_code
from app.service import AppService


def test_short_codes_use_unambiguous_characters_and_preserve_legacy_invites():
    for _ in range(100):
        code = new_join_code()
        assert len(code) == 4 and set(code) <= set(ALPHABET)
    assert normalize_join_code(" ab7k ") == "AB7K"
    assert normalize_join_code("ABCDEF0123456789") == "abcdef0123456789"


def test_memory_code_collision_retries_and_owner_approval_is_still_required(monkeypatch):
    service = AppService()
    owner = service.register("owner@test.invalid", "Owner", "password1")
    guest = service.register("guest@test.invalid", "Guest", "password1")
    group = service.create_group(owner["id"], "Trip")
    codes = iter(["AB7K", "AB7K", "CD8M"])
    monkeypatch.setattr("app.service.new_join_code", lambda: next(codes))
    first = service.create_join_code(owner["id"], group["id"])
    second = service.create_join_code(owner["id"], group["id"])
    assert first["code"] == "AB7K" and second["code"] == "CD8M"
    request = service.join_group(guest["id"], " ab7k ")
    assert guest["id"] not in service.groups[group["id"]].member_ids
    service.decide_join(owner["id"], group["id"], request["id"], True)
    assert guest["id"] in service.groups[group["id"]].member_ids
    service.revoke_join_code(owner["id"], "cd8m")
    with pytest.raises(DomainError, match="invalid, expired, or revoked"):
        service.join_group(guest["id"], "CD8M")


def test_existing_long_code_works_until_expiry_and_collision_exhaustion_is_bounded(monkeypatch):
    service = AppService()
    owner = service.register("owner@test.invalid", "Owner", "password1")
    guest = service.register("guest@test.invalid", "Guest", "password1")
    group = service.create_group(owner["id"], "Trip")
    legacy = "abcdef0123456789abcdef0123456789"
    service.join_codes[legacy] = {
        "group_id": group["id"],
        "expires_at": datetime.now(UTC).timestamp() + 3600,
        "revoked": False,
    }
    assert service.join_group(guest["id"], legacy.upper())["status"] == "pending"
    monkeypatch.setattr("app.service.new_join_code", lambda: "AB7K")
    service.create_join_code(owner["id"], group["id"])
    with pytest.raises(DomainError, match="unique join code"):
        service.create_join_code(owner["id"], group["id"])
    assert service.join_group(guest["id"], "AB7K")["status"] == "pending"
