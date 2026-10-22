from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from secrets import token_hex
from argon2 import PasswordHasher
from .domain.errors import DomainError
from .domain.splits import Share, equal_split, exact_split, percentage_split, weighted_split

passwords = PasswordHasher()
def now(): return datetime.now(timezone.utc).isoformat()

@dataclass
class User: id: str; email: str; display_name: str; password_hash: str
@dataclass
class Group: id: str; name: str; owner_id: str; member_ids: set[str] = field(default_factory=set); version: int = 0
@dataclass
class Event:
    id: str; group_id: str; kind: str; actor_id: str; effective_date: str; recorded_at: str; amount_paise: int = 0
    payer_id: str | None = None; shares: list[Share] = field(default_factory=list); from_user_id: str | None = None; to_user_id: str | None = None
    title: str | None = None; category: str | None = None; reason: str | None = None; reverses_event_id: str | None = None; correction_of_event_id: str | None = None

class AppService:
    def __init__(self):
        self.users = {}; self.groups = {}; self.events = {}; self.ledger = []; self.idempotency = {}
        self.sessions = {}; self.recovery_tokens = {}; self.join_codes = {}; self.presets = {}; self.deleted_users = set()
    def _id(self): return token_hex(16)
    def _public(self, user): return {"id": user.id, "email": user.email, "displayName": user.display_name}
    def register(self, email, display_name, password):
        email = email.strip().lower()
        if any(u.email == email for u in self.users.values()): raise DomainError("CONFLICT", "Email is already registered.")
        user = User(self._id(), email, display_name, passwords.hash(password)); self.users[user.id] = user; return self._public(user)
    def authenticate(self, email, password):
        user = next((u for u in self.users.values() if u.email == email.strip().lower()), None)
        try: passwords.verify(user.password_hash, password) if user else (_ for _ in ()).throw(ValueError())
        except Exception as exc: raise DomainError("UNAUTHORIZED", "Invalid email or password.") from exc
        return self._public(user)
    def issue_session(self, user_id):
        token = self._id(); self.sessions[token] = {"user_id": user_id, "revoked": False, "expires_at": datetime.now(timezone.utc).timestamp() + 60 * 60 * 24 * 30}; return token
    def revoke_session(self, token):
        if token in self.sessions: self.sessions[token]["revoked"] = True
    def session_user(self, token):
        session = self.sessions.get(token)
        if not session or session["revoked"] or session["expires_at"] <= datetime.now(timezone.utc).timestamp(): raise DomainError("UNAUTHORIZED", "Session is missing, expired, or revoked.")
        return session["user_id"]
    def request_recovery(self, email):
        user = next((u for u in self.users.values() if u.email == email.strip().lower()), None)
        if not user: return {"accepted": True}
        token = self._id(); self.recovery_tokens[token] = user.id; return {"accepted": True, "recoveryToken": token}
    def recover(self, token, password):
        user_id = self.recovery_tokens.pop(token, None)
        if not user_id: raise DomainError("UNAUTHORIZED", "Recovery token is invalid or expired.")
        self.users[user_id].password_hash = passwords.hash(password); return {"reset": True}
    def delete_account(self, actor):
        if actor not in self.users: raise DomainError("NOT_FOUND", "User not found.")
        self.users[actor].display_name = "Deleted user"; self.users[actor].email = f"deleted-{actor}@invalid"; self.users[actor].password_hash = passwords.hash(token_hex(16)); self.deleted_users.add(actor); return {"deleted": True, "retainedFinancialHistory": True}
    def create_group(self, actor_id, name):
        group = Group(self._id(), name, actor_id, {actor_id}); self.groups[group.id] = group; return self.group_view(group)
    def archive_group(self, actor, group_id):
        group = self._require(actor, group_id, True); group.archived = True; group.version += 1; return self.group_view(group)
    def create_join_code(self, actor, group_id, ttl_seconds=86400):
        group = self._require(actor, group_id, True); code = token_hex(8); self.join_codes[code] = {"group_id": group_id, "expires_at": datetime.now(timezone.utc).timestamp() + ttl_seconds, "revoked": False}; return {"code": code, "expiresAt": self.join_codes[code]["expires_at"]}
    def join_group(self, actor, code):
        invite = self.join_codes.get(code)
        if not invite or invite["revoked"] or invite["expires_at"] <= datetime.now(timezone.utc).timestamp(): raise DomainError("CONFLICT", "Join code is invalid, expired, or revoked.")
        group = self.groups[invite["group_id"]]
        if getattr(group, "archived", False): raise DomainError("CONFLICT", "Archived groups cannot accept members.")
        group.member_ids.add(actor); group.version += 1; return self.group_view(group)
    def revoke_join_code(self, actor, code):
        invite = self.join_codes.get(code)
        if not invite: raise DomainError("NOT_FOUND", "Join code not found.")
        self._require(actor, invite["group_id"], True); invite["revoked"] = True; return {"revoked": True}
    def add_member(self, actor_id, group_id, email):
        group = self._require(actor_id, group_id, True); user = next((u for u in self.users.values() if u.email == email.lower()), None)
        if not user: raise DomainError("NOT_FOUND", "User not found.")
        group.member_ids.add(user.id); group.version += 1; return self.group_view(group)
    def group_view(self, group): return {"id": group.id, "name": group.name, "ownerId": group.owner_id, "version": group.version, "members": [self._public(self.users[i]) for i in sorted(group.member_ids)]}
    def balances(self, actor_id, group_id):
        group = self._require(actor_id, group_id)
        return [{"userId": i, "balancePaise": str(sum(d for event_id, user_id, d in self.ledger if user_id == i and self.events[event_id].group_id == group_id))} for i in sorted(group.member_ids)]
    def _once(self, actor, group, key, payload, work):
        identity = f"{actor}:{group}:{key}"; digest = sha256(repr(payload).encode()).hexdigest()
        if identity in self.idempotency:
            old, result = self.idempotency[identity]
            if old != digest: raise DomainError("DUPLICATE_REQUEST", "Idempotency key was reused with a different request.")
            return result
        result = work(); self.idempotency[identity] = (digest, result); return result
    def post_expense(self, actor, group_id, data, key):
        group = self._require(actor, group_id)
        if getattr(group, "archived", False): raise DomainError("CONFLICT", "Archived groups cannot accept financial writes.")
        def work():
            amount = int(data["amountPaise"]); self._member(group, data["payerId"])
            ids = data.get("participantIds") or [x["userId"] for x in data.get("percentages", [])] or [x["userId"] for x in data.get("weights", [])] or [x["userId"] for x in data.get("shares", [])]
            for i in ids: self._member(group, i)
            if data["splitMethod"] == "equal": shares = equal_split(amount, ids)
            elif data["splitMethod"] == "percentage": shares = percentage_split(amount, [(x["userId"], x["basisPoints"]) for x in data.get("percentages", [])])
            elif data["splitMethod"] == "weighted": shares = weighted_split(amount, [(x["userId"], x["weight"]) for x in data.get("weights", [])])
            else: shares = exact_split(amount, [Share(x["userId"], int(x["amountPaise"])) for x in data.get("shares", [])])
            event = Event(self._id(), group_id, "expense", actor, data["effectiveDate"], now(), amount, data["payerId"], shares, title=data["title"], category=data["category"]); self.events[event.id] = event
            self.ledger.append((event.id, data["payerId"], amount)); self.ledger.extend((event.id, s.user_id, -s.amount_paise) for s in shares); group.version += 1; return self._view(event)
        return self._once(actor, group_id, key, data, work)
    def post_settlement(self, actor, group_id, data, key):
        group = self._require(actor, group_id)
        if getattr(group, "archived", False): raise DomainError("CONFLICT", "Archived groups cannot accept financial writes.")
        def work():
            if data["fromUserId"] == data["toUserId"]: raise DomainError("OVER_SETTLEMENT", "A member cannot pay themselves.")
            self._member(group, data["fromUserId"]); self._member(group, data["toUserId"]); amount = int(data["amountPaise"]); current = {x["userId"]: int(x["balancePaise"]) for x in self.balances(actor, group_id)}
            if amount <= 0 or amount > -current[data["fromUserId"]] or amount > current[data["toUserId"]]: raise DomainError("OVER_SETTLEMENT", "Settlement exceeds current debt or credit.")
            event = Event(self._id(), group_id, "settlement", actor, data["effectiveDate"], now(), amount, from_user_id=data["fromUserId"], to_user_id=data["toUserId"]); self.events[event.id] = event
            self.ledger.extend(((event.id, event.from_user_id, amount), (event.id, event.to_user_id, -amount))); group.version += 1; return self._view(event)
        return self._once(actor, group_id, key, data, work)
    def suggestions(self, actor, group_id):
        balances = [(x["userId"], int(x["balancePaise"])) for x in self.balances(actor, group_id)]; debtors = [[i, -a] for i, a in balances if a < 0]; creditors = [[i, a] for i, a in balances if a > 0]; debtors.sort(key=lambda x: (-x[1], x[0])); creditors.sort(key=lambda x: (-x[1], x[0])); result = []
        while debtors and creditors:
            amount = min(debtors[0][1], creditors[0][1]); result.append({"fromUserId": debtors[0][0], "toUserId": creditors[0][0], "amountPaise": str(amount)}); debtors[0][1] -= amount; creditors[0][1] -= amount
            if not debtors[0][1]: debtors.pop(0)
            if not creditors[0][1]: creditors.pop(0)
        return {"version": self.groups[group_id].version, "suggestions": result}
    def history(self, actor, group_id): self._require(actor, group_id); return [self._view(e) for e in sorted((e for e in self.events.values() if e.group_id == group_id), key=lambda e: e.recorded_at, reverse=True)]
    def explanation(self, actor, group_id, user_id=None):
        self._require(actor, group_id); user_id = user_id or actor
        return {"userId": user_id, "events": [self._view(e) | {"contributionPaise": str(sum(d for event_id, member, d in self.ledger if event_id == e.id and member == user_id))} for e in self.events.values() if e.group_id == group_id and any(member == user_id for event_id, member, _ in self.ledger if event_id == e.id)]}
    def search_history(self, actor, group_id, query="", limit=25):
        return [e for e in self.history(actor, group_id) if not query or query.lower() in str(e).lower()][:min(max(limit, 1), 100)]
    def create_preset(self, actor, group_id, name, split_method, participant_ids, weights=None):
        group = self._require(actor, group_id); [self._member(group, i) for i in participant_ids]; preset = {"id": self._id(), "groupId": group_id, "name": name, "splitMethod": split_method, "participantIds": participant_ids, "weights": weights or []}; self.presets[preset["id"]] = preset; return preset
    def list_presets(self, actor, group_id): self._require(actor, group_id); return [p for p in self.presets.values() if p["groupId"] == group_id]
    def monthly_report(self, actor, group_id, month):
        self._require(actor, group_id); prefix = month + "-"; expenses = [e for e in self.events.values() if e.group_id == group_id and e.kind == "expense" and e.effective_date.startswith(prefix)]
        categories = {}; members = {}
        for event in expenses:
            categories[event.category or "Other"] = categories.get(event.category or "Other", 0) + event.amount_paise
            for share in event.shares: members[share.user_id] = members.get(share.user_id, 0) + share.amount_paise
        return {"month": month, "categories": {k: str(v) for k, v in categories.items()}, "memberShares": {k: str(v) for k, v in members.items()}, "settlements": [self._view(e) for e in self.events.values() if e.group_id == group_id and e.kind == "settlement" and e.effective_date.startswith(prefix)]}
    @staticmethod
    def report_csv(report):
        lines = ["section,key,amountPaise"] + [f"category,{k},{v}" for k, v in report["categories"].items()] + [f"memberShare,{k},{v}" for k, v in report["memberShares"].items()]
        return "\n".join(line.replace("=", "'") if line.split(",")[1][:1] in "=+-@" else line for line in lines) + "\n"
    def correct_expense(self, actor, group_id, event_id, replacement, reason, key):
        group = self._require(actor, group_id); original = self.events.get(event_id)
        if not original or original.group_id != group_id or original.kind != "expense": raise DomainError("NOT_FOUND", "Expense not found.")
        if original.actor_id != actor and group.owner_id != actor: raise DomainError("FORBIDDEN", "Only the creator or owner may correct it.")
        if any(e.reverses_event_id == event_id for e in self.events.values()): raise DomainError("CONFLICT", "Expense has already been corrected.")
        reversal = Event(self._id(), group_id, "reversal", actor, original.effective_date, now(), reason=reason, reverses_event_id=event_id); self.events[reversal.id] = reversal
        for event_id_, user_id, delta in list(self.ledger):
            if event_id_ == event_id: self.ledger.append((reversal.id, user_id, -delta))
        result = self.post_expense(actor, group_id, replacement, key + ":replacement"); replacement_event = self.events[next(i for i, e in self.events.items() if self._view(e) == result)]; replacement_event.correction_of_event_id = event_id; return {"reversal": self._view(reversal), "replacement": self._view(replacement_event)}
    def _require(self, actor, group_id, owner=False):
        group = self.groups.get(group_id)
        if not group: raise DomainError("NOT_FOUND", "Group not found.")
        if actor not in group.member_ids: raise DomainError("FORBIDDEN", "You are not a group member.")
        if owner and actor != group.owner_id: raise DomainError("FORBIDDEN", "Only the group owner may perform this action.")
        return group
    @staticmethod
    def _member(group, user_id):
        if user_id not in group.member_ids: raise DomainError("FORBIDDEN", "User must belong to the group.")
    @staticmethod
    def _view(event):
        result = {"id": event.id, "group_id": event.group_id, "kind": event.kind, "actor_id": event.actor_id, "effective_date": event.effective_date, "recorded_at": event.recorded_at, "amountPaise": str(event.amount_paise), "payerId": event.payer_id, "shares": [{"userId": s.user_id, "amountPaise": str(s.amount_paise)} for s in event.shares], "fromUserId": event.from_user_id, "toUserId": event.to_user_id, "title": event.title, "category": event.category, "reason": event.reason, "reversesEventId": event.reverses_event_id, "correctionOfEventId": event.correction_of_event_id}
        return {k: v for k, v in result.items() if v is not None}
