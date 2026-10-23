import csv
import io
import json
import re
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from functools import wraps
from hashlib import sha256
from secrets import token_hex
from threading import RLock

from argon2 import PasswordHasher

from .domain.errors import DomainError
from .domain.expenses import prepare_expense
from .domain.splits import Share, equal_split, exact_split, percentage_split, weighted_split


def atomic(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        with self.lock:
            snapshot = deepcopy({k: v for k, v in vars(self).items() if k != "lock"})
            try:
                return method(self, *args, **kwargs)
            except Exception:
                for key, value in snapshot.items():
                    setattr(self, key, value)
                raise

    return wrapped


passwords = PasswordHasher()


def now():
    return datetime.now(UTC).isoformat()


@dataclass
class User:
    id: str
    email: str
    display_name: str
    password_hash: str


@dataclass
class Group:
    id: str
    name: str
    owner_id: str
    member_ids: set[str] = field(default_factory=set)
    version: int = 0
    archived: bool = False


@dataclass
class Event:
    id: str
    group_id: str
    kind: str
    actor_id: str
    effective_date: str
    recorded_at: str
    amount_paise: int = 0
    payer_id: str | None = None
    shares: list[Share] = field(default_factory=list)
    from_user_id: str | None = None
    to_user_id: str | None = None
    title: str | None = None
    category: str | None = None
    reason: str | None = None
    reverses_event_id: str | None = None
    correction_of_event_id: str | None = None
    note: str | None = None


class AppService:
    storage = "memory"

    def __init__(self):
        self.lock = RLock()
        self.join_requests = {}
        self.users = {}
        self.groups = {}
        self.events = {}
        self.ledger = []
        self.idempotency = {}
        self.sessions = {}
        self.recovery_tokens = {}
        self.join_codes = {}
        self.presets = {}
        self.deleted_users = set()

    def _id(self):
        return token_hex(16)

    def _public(self, user):
        return {"id": user.id, "email": user.email, "displayName": user.display_name}

    def get_profile(self, actor):
        return self._public(self.users[actor])

    def list_groups(self, actor):
        return [self.group_view(g) for g in self.groups.values() if actor in g.member_ids]

    @atomic
    def register_session(self, email, display_name, password):
        user = self.register(email, display_name, password)
        return user | {"sessionToken": self.issue_session(user["id"])}

    @atomic
    def login(self, email, password):
        user = self.authenticate(email, password)
        return user | {"sessionToken": self.issue_session(user["id"])}

    def health(self):
        return {
            "status": "ok",
            "storage": self.storage,
            "persistent": False,
            "productionReady": False,
        }

    @atomic
    def register(self, email, display_name, password):
        email = email.strip().lower()
        if (
            not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)
            or not display_name.strip()
            or len(display_name) > 80
            or len(password) < 8
        ):
            raise DomainError(
                "INVALID_INPUT",
                "Enter a valid email, name and password of at least eight characters.",
            )
        if any(u.email == email for u in self.users.values()):
            raise DomainError("CONFLICT", "Email is already registered.")
        user = User(self._id(), email, display_name, passwords.hash(password))
        self.users[user.id] = user
        return self._public(user)

    def authenticate(self, email, password):
        user = next((u for u in self.users.values() if u.email == email.strip().lower()), None)
        try:
            passwords.verify(user.password_hash, password) if user else (_ for _ in ()).throw(
                ValueError()
            )
        except Exception as exc:
            raise DomainError("UNAUTHORIZED", "Invalid email or password.") from exc
        if user.id in self.deleted_users:
            raise DomainError("UNAUTHORIZED", "Account is deleted.")
        return self._public(user)

    @atomic
    def issue_session(self, user_id):
        token = self._id()
        self.sessions[token] = {
            "user_id": user_id,
            "revoked": False,
            "expires_at": datetime.now(UTC).timestamp() + 60 * 60 * 24 * 30,
        }
        return token

    @atomic
    def revoke_session(self, token):
        if token in self.sessions:
            self.sessions[token]["revoked"] = True

    def session_user(self, token):
        session = self.sessions.get(token)
        if (
            not session
            or session["revoked"]
            or session["expires_at"] <= datetime.now(UTC).timestamp()
        ):
            raise DomainError("UNAUTHORIZED", "Session is missing, expired, or revoked.")
        if session["user_id"] in self.deleted_users:
            raise DomainError("UNAUTHORIZED", "Account is deleted.")
        return session["user_id"]

    @atomic
    def request_recovery(self, email):
        # Delivery belongs to a configured trusted mail service; never return a reset credential.
        return {"accepted": True}

    @atomic
    def provision_recovery(self, user_id):
        if user_id not in self.users or user_id in self.deleted_users:
            raise DomainError("NOT_FOUND", "User not found.")
        token = self._id()
        self.recovery_tokens[sha256(token.encode()).hexdigest()] = (
            user_id,
            datetime.now(UTC).timestamp() + 900,
        )
        return token

    @atomic
    def recover(self, token, password):
        if len(password) < 8:
            raise DomainError("INVALID_INPUT", "Password must contain at least eight characters.")
        recovery = self.recovery_tokens.pop(sha256(token.encode()).hexdigest(), None)
        if not recovery or recovery[1] <= datetime.now(UTC).timestamp():
            raise DomainError("UNAUTHORIZED", "Recovery token is invalid or expired.")
        user_id = recovery[0]
        self.users[user_id].password_hash = passwords.hash(password)
        for session in self.sessions.values():
            if session["user_id"] == user_id:
                session["revoked"] = True
        return {"reset": True}

    @atomic
    def update_profile(self, actor, display_name):
        if not display_name.strip() or len(display_name) > 80:
            raise DomainError("INVALID_INPUT", "Name must contain 1 to 80 characters.")
        self.users[actor].display_name = display_name.strip()
        return self._public(self.users[actor])

    @atomic
    def delete_account(self, actor):
        if actor not in self.users:
            raise DomainError("NOT_FOUND", "User not found.")
        for session in self.sessions.values():
            if session["user_id"] == actor:
                session["revoked"] = True
        self.recovery_tokens = {k: v for k, v in self.recovery_tokens.items() if v[0] != actor}
        self.users[actor].display_name = "Deleted user"
        self.users[actor].email = f"deleted-{actor}@invalid"
        self.users[actor].password_hash = passwords.hash(token_hex(16))
        self.deleted_users.add(actor)
        return {"deleted": True, "retainedFinancialHistory": True}

    @atomic
    def create_group(self, actor_id, name):
        if not name.strip() or len(name) > 80:
            raise DomainError("INVALID_INPUT", "Group name must contain 1 to 80 characters.")
        group = Group(self._id(), name.strip(), actor_id, {actor_id})
        self.groups[group.id] = group
        return self.group_view(group)

    @atomic
    def archive_group(self, actor, group_id):
        group = self._require(actor, group_id, True)
        if any(int(b["balancePaise"]) for b in self.balances(actor, group_id)):
            raise DomainError("CONFLICT", "Settle all balances before archiving.")
        group.archived = True
        group.version += 1
        return self.group_view(group)

    @atomic
    def create_join_code(self, actor, group_id, ttl_seconds=86400):
        group = self._require(actor, group_id, True)
        if group.archived or not 60 <= ttl_seconds <= 604800:
            raise DomainError(
                "INVALID_INPUT", "Choose an active group and an expiry of 1 minute to 7 days."
            )
        code = token_hex(8)
        self.join_codes[code] = {
            "group_id": group_id,
            "expires_at": datetime.now(UTC).timestamp() + ttl_seconds,
            "revoked": False,
        }
        return {"code": code, "expiresAt": self.join_codes[code]["expires_at"]}

    @atomic
    def join_group(self, actor, code):
        invite = self.join_codes.get(code)
        if not invite or invite["revoked"] or invite["expires_at"] <= datetime.now(UTC).timestamp():
            raise DomainError("CONFLICT", "Join code is invalid, expired, or revoked.")
        group = self.groups[invite["group_id"]]
        if getattr(group, "archived", False):
            raise DomainError("CONFLICT", "Archived groups cannot accept members.")
        if actor in group.member_ids:
            return {"status": "approved", "groupId": group.id}
        pending = next(
            (
                r
                for r in self.join_requests.values()
                if r["groupId"] == group.id and r["userId"] == actor and r["status"] == "pending"
            ),
            None,
        )
        if pending:
            return pending
        request = {
            "id": self._id(),
            "groupId": group.id,
            "userId": actor,
            "code": code,
            "status": "pending",
        }
        self.join_requests[request["id"]] = request
        return request

    def list_join_requests(self, actor, group_id):
        self._require(actor, group_id, True)
        return [
            r | {"user": self._public(self.users[r["userId"]])}
            for r in self.join_requests.values()
            if r["groupId"] == group_id and r["status"] == "pending"
        ]

    @atomic
    def decide_join(self, actor, group_id, request_id, approve):
        group = self._require(actor, group_id, True)
        request = self.join_requests.get(request_id)
        if not request or request["groupId"] != group_id or request["status"] != "pending":
            raise DomainError("NOT_FOUND", "Pending join request not found.")
        invite = self.join_codes[request["code"]]
        if (
            group.archived
            or invite["revoked"]
            or invite["expires_at"] <= datetime.now(UTC).timestamp()
        ):
            raise DomainError("CONFLICT", "Group is archived or invite is no longer valid.")
        if approve:
            if len(group.member_ids) >= 50:
                raise DomainError("CONFLICT", "Groups support up to 50 members.")
            group.member_ids.add(request["userId"])
            group.version += 1
        request["status"] = "approved" if approve else "rejected"
        return request

    @atomic
    def revoke_join_code(self, actor, code):
        invite = self.join_codes.get(code)
        if not invite:
            raise DomainError("NOT_FOUND", "Join code not found.")
        self._require(actor, invite["group_id"], True)
        invite["revoked"] = True
        return {"revoked": True}

    @atomic
    def add_member(self, actor_id, group_id, email):
        group = self._require(actor_id, group_id, True)
        user = next((u for u in self.users.values() if u.email == email.lower()), None)
        if not user:
            raise DomainError("NOT_FOUND", "User not found.")
        if group.archived or len(group.member_ids) >= 50:
            raise DomainError("CONFLICT", "Group is archived or full.")
        group.member_ids.add(user.id)
        group.version += 1
        return self.group_view(group)

    def group_view(self, group):
        return {
            "id": group.id,
            "name": group.name,
            "ownerId": group.owner_id,
            "version": group.version,
            "archived": group.archived,
            "members": [self._public(self.users[i]) for i in sorted(group.member_ids)],
        }

    @atomic
    def balances(self, actor_id, group_id):
        group = self._require(actor_id, group_id)
        return [
            {
                "userId": i,
                "balancePaise": str(
                    sum(
                        d
                        for event_id, user_id, d in self.ledger
                        if user_id == i and self.events[event_id].group_id == group_id
                    )
                ),
            }
            for i in sorted(group.member_ids)
        ]

    def _once(self, actor, group, key, payload, work):
        if not isinstance(key, str) or not 1 <= len(key) <= 160:
            raise DomainError("INVALID_INPUT", "A stable request key is required.")
        identity = f"{actor}:{group}:{key}"
        digest = sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if identity in self.idempotency:
            old, result = self.idempotency[identity]
            if old != digest:
                raise DomainError(
                    "DUPLICATE_REQUEST", "Idempotency key was reused with a different request."
                )
            return deepcopy(result)
        result = work()
        self.idempotency[identity] = (digest, deepcopy(result))
        return result

    @atomic
    def post_expense(self, actor, group_id, data, key):
        group = self._require(actor, group_id)

        def work():
            if group.archived:
                raise DomainError("CONFLICT", "Archived groups cannot accept financial writes.")
            self._validate_financial(data)
            amount, shares = prepare_expense(group.member_ids, data)
            event = Event(
                self._id(),
                group_id,
                "expense",
                actor,
                data["effectiveDate"],
                now(),
                amount,
                data["payerId"],
                shares,
                title=data["title"],
                category=data["category"],
                note=data.get("note"),
            )
            self.events[event.id] = event
            self.ledger.append((event.id, data["payerId"], amount))
            self.ledger.extend((event.id, s.user_id, -s.amount_paise) for s in shares)
            group.version += 1
            return self._view(event)

        return self._once(actor, group_id, key, {"operation": "expense", "data": data}, work)

    @atomic
    def post_settlement(self, actor, group_id, data, key):
        group = self._require(actor, group_id)

        def work():
            if group.archived:
                raise DomainError("CONFLICT", "Archived groups cannot accept financial writes.")
            if actor != data["fromUserId"] and actor != group.owner_id:
                raise DomainError("FORBIDDEN", "Only sender or group owner may record a payment.")
            if data["fromUserId"] == data["toUserId"]:
                raise DomainError("OVER_SETTLEMENT", "A member cannot pay themselves.")
            self._member(group, data["fromUserId"])
            self._member(group, data["toUserId"])
            self._validate_financial(data)
            amount = int(data["amountPaise"])
            current = {x["userId"]: int(x["balancePaise"]) for x in self.balances(actor, group_id)}
            if (
                amount <= 0
                or amount > -current[data["fromUserId"]]
                or amount > current[data["toUserId"]]
            ):
                raise DomainError("OVER_SETTLEMENT", "Settlement exceeds current debt or credit.")
            event = Event(
                self._id(),
                group_id,
                "settlement",
                actor,
                data["effectiveDate"],
                now(),
                amount,
                from_user_id=data["fromUserId"],
                to_user_id=data["toUserId"],
            )
            self.events[event.id] = event
            self.ledger.extend(
                ((event.id, event.from_user_id, amount), (event.id, event.to_user_id, -amount))
            )
            group.version += 1
            return self._view(event)

        return self._once(actor, group_id, key, {"operation": "settlement", "data": data}, work)

    @atomic
    def suggestions(self, actor, group_id):
        balances = [(x["userId"], int(x["balancePaise"])) for x in self.balances(actor, group_id)]
        debtors = [[i, -a] for i, a in balances if a < 0]
        creditors = [[i, a] for i, a in balances if a > 0]
        debtors.sort(key=lambda x: (-x[1], x[0]))
        creditors.sort(key=lambda x: (-x[1], x[0]))
        result = []
        while debtors and creditors:
            amount = min(debtors[0][1], creditors[0][1])
            result.append(
                {
                    "fromUserId": debtors[0][0],
                    "toUserId": creditors[0][0],
                    "amountPaise": str(amount),
                }
            )
            debtors[0][1] -= amount
            creditors[0][1] -= amount
            if not debtors[0][1]:
                debtors.pop(0)
            if not creditors[0][1]:
                creditors.pop(0)
        return {"version": self.groups[group_id].version, "suggestions": result}

    @atomic
    def history(self, actor, group_id):
        self._require(actor, group_id)
        return [
            self._view(e)
            for e in sorted(
                (e for e in self.events.values() if e.group_id == group_id),
                key=lambda e: e.recorded_at,
                reverse=True,
            )
        ]

    @atomic
    def explanation(self, actor, group_id, user_id=None):
        group = self._require(actor, group_id)
        user_id = user_id or actor
        self._member(group, user_id)
        return {
            "userId": user_id,
            "events": [
                self._view(e)
                | {
                    "contributionPaise": str(
                        sum(
                            d
                            for event_id, member, d in self.ledger
                            if event_id == e.id and member == user_id
                        )
                    )
                }
                for e in self.events.values()
                if e.group_id == group_id
                and any(
                    member == user_id for event_id, member, _ in self.ledger if event_id == e.id
                )
            ],
        }

    def search_history(self, actor, group_id, query="", limit=25):
        return [
            e for e in self.history(actor, group_id) if not query or query.lower() in str(e).lower()
        ][: min(max(limit, 1), 100)]

    def history_page(self, actor, group_id, query="", limit=25, offset=0):
        rows = [
            e for e in self.history(actor, group_id) if not query or query.lower() in str(e).lower()
        ]
        return {
            "items": rows[offset : offset + limit],
            "nextOffset": offset + limit if offset + limit < len(rows) else None,
        }

    @atomic
    def create_preset(
        self,
        actor,
        group_id,
        name,
        split_method,
        participant_ids,
        weights=None,
        percentages=None,
        shares=None,
    ):
        group = self._require(actor, group_id, True)
        if group.archived or not name.strip() or len(name) > 80:
            raise DomainError(
                "INVALID_INPUT", "Choose an active group and a preset name of 1 to 80 characters."
            )
        if not participant_ids or len(set(participant_ids)) != len(participant_ids):
            raise DomainError("INVALID_SPLIT", "Select unique participants.")
        for i in participant_ids:
            self._member(group, i)
        if split_method == "equal":
            equal_split(10000, participant_ids)
        elif split_method == "weighted":
            weighted_split(10000, [(x["userId"], x["weight"]) for x in weights or []])
        elif split_method == "percentage":
            percentage_split(10000, [(x["userId"], x["basisPoints"]) for x in percentages or []])
        elif split_method == "exact":
            exact_split(
                sum(int(x["amountPaise"]) for x in shares or []),
                [Share(x["userId"], int(x["amountPaise"])) for x in shares or []],
            )
        else:
            raise DomainError("INVALID_SPLIT", "Choose a supported split method.")
        values = {"weighted": weights, "percentage": percentages, "exact": shares}.get(split_method)
        if split_method != "equal" and {x["userId"] for x in values or []} != set(participant_ids):
            raise DomainError("INVALID_SPLIT", "Preset values must match its participants.")
        preset = {
            "id": self._id(),
            "groupId": group_id,
            "name": name.strip(),
            "splitMethod": split_method,
            "participantIds": participant_ids,
            "weights": weights or [],
            "percentages": percentages or [],
            "shares": shares or [],
        }
        self.presets[preset["id"]] = preset
        return preset

    @atomic
    def list_presets(self, actor, group_id):
        self._require(actor, group_id)
        return [p for p in self.presets.values() if p["groupId"] == group_id]

    @atomic
    def monthly_report(self, actor, group_id, month):
        group = self._require(actor, group_id)
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            raise DomainError("INVALID_INPUT", "Month must be YYYY-MM.")
        prefix = month + "-"
        reversed_ids = {e.reverses_event_id for e in self.events.values() if e.kind == "reversal"}
        expenses = [
            e
            for e in self.events.values()
            if e.group_id == group_id
            and e.kind == "expense"
            and e.id not in reversed_ids
            and e.effective_date.startswith(prefix)
        ]
        categories = {}
        members = {}
        for event in expenses:
            categories[event.category or "Other"] = (
                categories.get(event.category or "Other", 0) + event.amount_paise
            )
            for share in event.shares:
                members[share.user_id] = members.get(share.user_id, 0) + share.amount_paise
        opening = {i: 0 for i in group.member_ids}
        closing = dict(opening)
        for event_id, user_id, delta in self.ledger:
            event = self.events[event_id]
            if event.group_id != group_id:
                continue
            if event.effective_date[:7] < month:
                opening[user_id] += delta
            if event.effective_date[:7] <= month:
                closing[user_id] += delta
        return {
            "openingBalances": {k: str(v) for k, v in opening.items()},
            "closingBalances": {k: str(v) for k, v in closing.items()},
            "month": month,
            "categories": {k: str(v) for k, v in categories.items()},
            "memberShares": {k: str(v) for k, v in members.items()},
            "settlements": [
                self._view(e)
                for e in self.events.values()
                if e.group_id == group_id
                and e.kind == "settlement"
                and e.effective_date.startswith(prefix)
            ],
        }

    @staticmethod
    def report_csv(report):
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["section", "key", "amountPaise"])

        def text(value):
            value = str(value)
            return (
                "'" + value
                if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n"))
                else value
            )

        for section, report_field in (
            ("category", "categories"),
            ("memberShare", "memberShares"),
            ("openingBalance", "openingBalances"),
            ("closingBalance", "closingBalances"),
        ):
            for key, value in report.get(report_field, {}).items():
                writer.writerow([section, text(key), value])
        for event in report["settlements"]:
            writer.writerow(["settlement", text(event["id"]), event["amountPaise"]])
        return output.getvalue()

    @atomic
    def correct_expense(self, actor, group_id, event_id, replacement, reason, key):
        def work():
            group = self._require(actor, group_id)
            original = self.events.get(event_id)
            if group.archived:
                raise DomainError("CONFLICT", "Archived groups cannot accept corrections.")
            if not str(reason).strip() or len(reason) > 1000:
                raise DomainError("INVALID_INPUT", "A correction reason is required.")
            if not original or original.group_id != group_id or original.kind != "expense":
                raise DomainError("NOT_FOUND", "Expense not found.")
            if original.actor_id != actor and group.owner_id != actor:
                raise DomainError("FORBIDDEN", "Only the creator or owner may correct it.")
            if any(e.reverses_event_id == event_id for e in self.events.values()):
                raise DomainError("CONFLICT", "Expense has already been corrected.")
            result = self.post_expense(actor, group_id, replacement, key + ":replacement")
            replacement_event = self.events[result["id"]]
            replacement_event.correction_of_event_id = event_id
            reversal = Event(
                self._id(),
                group_id,
                "reversal",
                actor,
                original.effective_date,
                now(),
                reason=reason,
                reverses_event_id=event_id,
            )
            self.events[reversal.id] = reversal
            self.ledger.extend(
                (reversal.id, user_id, -delta)
                for eid, user_id, delta in list(self.ledger)
                if eid == event_id
            )
            return {"reversal": self._view(reversal), "replacement": self._view(replacement_event)}

        self._require(actor, group_id)
        return self._once(
            actor,
            group_id,
            key,
            {
                "operation": "correction",
                "eventId": event_id,
                "replacement": replacement,
                "reason": reason,
            },
            work,
        )

    @staticmethod
    def _validate_financial(data):
        if (
            not isinstance(data.get("amountPaise"), str)
            or not re.fullmatch(r"[0-9]+", data["amountPaise"])
            or not 0 < int(data["amountPaise"]) <= 1000000000
        ):
            raise DomainError(
                "INVALID_INPUT",
                "Amount must be a positive integer paise string within the supported range.",
            )
        try:
            date.fromisoformat(data["effectiveDate"])
        except (KeyError, ValueError, TypeError) as exc:
            raise DomainError("INVALID_INPUT", "Enter a valid effective date.") from exc

    def _require(self, actor, group_id, owner=False):
        if actor not in self.users or actor in self.deleted_users:
            raise DomainError("UNAUTHORIZED", "Account is unavailable.")
        group = self.groups.get(group_id)
        if not group:
            raise DomainError("NOT_FOUND", "Group not found.")
        if actor not in group.member_ids:
            raise DomainError("FORBIDDEN", "You are not a group member.")
        if owner and actor != group.owner_id:
            raise DomainError("FORBIDDEN", "Only the group owner may perform this action.")
        return group

    @staticmethod
    def _member(group, user_id):
        if user_id not in group.member_ids:
            raise DomainError("FORBIDDEN", "User must belong to the group.")

    @staticmethod
    def _view(event):
        result = {
            "id": event.id,
            "group_id": event.group_id,
            "kind": event.kind,
            "actor_id": event.actor_id,
            "effective_date": event.effective_date,
            "recorded_at": event.recorded_at,
            "amountPaise": str(event.amount_paise),
            "payerId": event.payer_id,
            "shares": [
                {"userId": s.user_id, "amountPaise": str(s.amount_paise)} for s in event.shares
            ],
            "fromUserId": event.from_user_id,
            "toUserId": event.to_user_id,
            "title": event.title,
            "category": event.category,
            "note": event.note,
            "reason": event.reason,
            "reversesEventId": event.reverses_event_id,
            "correctionOfEventId": event.correction_of_event_id,
        }
        return {k: v for k, v in result.items() if v is not None}
