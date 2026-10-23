"""PostgreSQL implementation of the API contract. No process-local application state."""

import json
import re
from datetime import UTC, date, datetime, timedelta
from functools import wraps
from hashlib import sha256
from secrets import token_hex
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool, PoolTimeout

from .domain.errors import DomainError
from .domain.expenses import prepare_expense
from .service import AppService, Group, passwords


def transaction(*, read_only=False):
    def decorate(method):
        @wraps(method)
        def call(self, *args, **kwargs):
            try:
                with self.pool.connection() as conn, conn.transaction():
                    if read_only:
                        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                    return method(self, conn, *args, **kwargs)
            except (PoolTimeout, psycopg.OperationalError) as exc:
                raise DomainError(
                    "UNAVAILABLE", "Database is temporarily unavailable. Retry the same request."
                ) from exc
            except psycopg.Error as exc:
                code = {
                    "42501": "FORBIDDEN",
                    "P0002": "NOT_FOUND",
                    "23503": "NOT_FOUND",
                    "22023": "INVALID_INPUT",
                    "22P02": "INVALID_INPUT",
                    "22007": "INVALID_INPUT",
                }.get(exc.sqlstate, "CONFLICT")
                if exc.sqlstate not in (
                    "42501",
                    "P0002",
                    "23503",
                    "22023",
                    "22P02",
                    "22007",
                    "23505",
                    "23514",
                    "55000",
                    "40001",
                    "40P01",
                ):
                    raise
                raise DomainError(
                    code, "The request conflicts with current data. Check your entries and refresh."
                ) from exc

        return call

    return decorate


def uid(value):
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError) as exc:
        raise DomainError("NOT_FOUND", "Record not found.") from exc


def digest(value):
    return sha256(value.encode()).digest()


def public(row):
    return {"id": str(row["id"]), "email": row["email"], "displayName": row["display_name"]}


class PostgresService:
    storage = "postgresql"
    report_csv = staticmethod(AppService.report_csv)

    def __init__(self, dsn, *, max_connections=5):
        self.pool = ConnectionPool(
            dsn,
            min_size=0,
            max_size=max_connections,
            open=False,
            timeout=20,
            kwargs={"row_factory": dict_row, "connect_timeout": 15, "prepare_threshold": None},
            check=ConnectionPool.check_connection,
        )

    def open(self):
        self.pool.open()
        try:
            with self.pool.connection() as conn:
                conn.execute("SELECT deleted_at FROM users LIMIT 0")
                conn.execute("SELECT 1 FROM recovery_tokens LIMIT 0")
                # All posting must go through audited SECURITY DEFINER routines.
                writable = conn.execute(
                    "SELECT has_table_privilege(current_user,'financial_events','INSERT') AS allowed"
                ).fetchone()["allowed"]
                if writable:
                    raise RuntimeError(
                        "DATABASE_URL must use the restricted API login, not the migration owner. Run python -m app.migrate first."
                    )
        except Exception:
            self.pool.close()
            raise

    def close(self):
        self.pool.close()

    @transaction(read_only=True)
    def health(self, conn):
        conn.execute("SELECT 1")
        return {
            "status": "ok",
            "storage": self.storage,
            "persistent": True,
            "productionReady": False,
        }

    @staticmethod
    def _user(conn, user_id, *, lock=False):
        user_id = uid(user_id)
        if lock:
            conn.execute("SELECT lock_splix_user(%s)", (user_id,))
        row = conn.execute(
            "SELECT * FROM users WHERE id=%s AND deleted_at IS NULL", (user_id,)
        ).fetchone()
        if not row:
            raise DomainError("UNAUTHORIZED", "Account is unavailable.")
        return row

    @staticmethod
    def _register(conn, email, display_name, password):
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
        user_id = conn.execute(
            "SELECT register_user(%s,%s,%s) AS id", (email, display_name, passwords.hash(password))
        ).fetchone()["id"]
        return public(conn.execute("SELECT * FROM users WHERE id=%s", (user_id,)).fetchone())

    @transaction()
    def register(self, conn, email, display_name, password):
        return self._register(conn, email, display_name, password)

    @transaction()
    def register_session(self, conn, email, display_name, password):
        user = self._register(conn, email, display_name, password)
        return user | {"sessionToken": self._issue_session(conn, user["id"])}

    def _authenticate(self, conn, email, password):
        row = conn.execute(
            "SELECT id FROM users WHERE normalized_email=%s AND deleted_at IS NULL",
            (email.strip().lower(),),
        ).fetchone()
        user = self._user(conn, row["id"], lock=True) if row else None
        try:
            if not user:
                raise ValueError()
            passwords.verify(user["password_hash"], password)
        except Exception as exc:
            raise DomainError("UNAUTHORIZED", "Invalid email or password.") from exc
        return public(user)

    @transaction()
    def authenticate(self, conn, email, password):
        return self._authenticate(conn, email, password)

    @transaction()
    def login(self, conn, email, password):
        user = self._authenticate(conn, email, password)
        return user | {"sessionToken": self._issue_session(conn, user["id"])}

    def _issue_session(self, conn, user_id):
        self._user(conn, user_id, lock=True)
        token = token_hex(32)
        conn.execute(
            "SELECT create_group_session(%s,%s,%s,NULL)",
            (uid(user_id), digest(token), datetime.now(UTC) + timedelta(days=30)),
        )
        return token

    @transaction()
    def issue_session(self, conn, user_id):
        return self._issue_session(conn, user_id)

    @transaction(read_only=True)
    def session_user(self, conn, token):
        row = conn.execute(
            """SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=%s AND s.revoked_at IS NULL AND s.expires_at>now() AND u.deleted_at IS NULL""",
            (digest(token),),
        ).fetchone()
        if not row:
            raise DomainError("UNAUTHORIZED", "Session is missing, expired, or revoked.")
        return str(row["user_id"])

    @transaction()
    def revoke_session(self, conn, token):
        conn.execute("SELECT revoke_group_session(%s)", (digest(token),))

    def request_recovery(self, email):
        # Credential delivery is deliberately left to a trusted mail integration.
        return {"accepted": True}

    @transaction()
    def provision_recovery(self, conn, user_id):
        token = token_hex(32)
        conn.execute("SELECT provision_splix_recovery(%s,%s)", (uid(user_id), digest(token)))
        return token

    @transaction()
    def recover(self, conn, token, password):
        if len(password) < 8:
            raise DomainError("INVALID_INPUT", "Password must contain at least eight characters.")
        if not conn.execute(
            "SELECT recover_splix_account(%s,%s) AS ok", (digest(token), passwords.hash(password))
        ).fetchone()["ok"]:
            raise DomainError("UNAUTHORIZED", "Recovery token is invalid or expired.")
        return {"reset": True}

    @transaction(read_only=True)
    def get_profile(self, conn, actor):
        return public(self._user(conn, actor))

    @transaction()
    def update_profile(self, conn, actor, display_name):
        if not display_name.strip() or len(display_name) > 80:
            raise DomainError("INVALID_INPUT", "Name must contain 1 to 80 characters.")
        conn.execute("SELECT update_splix_profile(%s,%s)", (uid(actor), display_name))
        return public(self._user(conn, actor))

    @transaction()
    def delete_account(self, conn, actor):
        conn.execute(
            "SELECT delete_splix_account(%s,%s)", (uid(actor), passwords.hash(token_hex(32)))
        )
        return {"deleted": True, "retainedFinancialHistory": True}

    def _group(self, conn, actor, group_id, *, owner=False, lock=False):
        actor, group_id = uid(actor), uid(group_id)
        if lock:
            conn.execute("SELECT lock_splix_group(%s,%s,%s)", (group_id, actor, owner))
        self._user(conn, actor)
        row = conn.execute("SELECT * FROM groups WHERE id=%s", (group_id,)).fetchone()
        if not row:
            raise DomainError("NOT_FOUND", "Group not found.")
        members = conn.execute(
            "SELECT u.* FROM users u JOIN group_members m ON m.user_id=u.id WHERE m.group_id=%s ORDER BY u.id",
            (group_id,),
        ).fetchall()
        if actor not in {r["id"] for r in members} or (owner and row["owner_id"] != actor):
            raise DomainError("FORBIDDEN", "Group permission required.")
        return row | {"members": [public(u) for u in members]}

    @staticmethod
    def _group_view(group):
        return {
            "id": str(group["id"]),
            "name": group["name"],
            "ownerId": str(group["owner_id"]),
            "version": group["version"],
            "archived": group["archived_at"] is not None,
            "members": group["members"],
        }

    @transaction(read_only=True)
    def list_groups(self, conn, actor):
        self._user(conn, actor)
        groups = conn.execute(
            "SELECT g.* FROM groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=%s ORDER BY m.joined_at,g.id",
            (uid(actor),),
        ).fetchall()
        members = {g["id"]: [] for g in groups}
        if groups:
            for row in conn.execute(
                "SELECT m.group_id,u.* FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=ANY(%s) ORDER BY m.group_id,u.id",
                (list(members),),
            ):
                members[row["group_id"]].append(public(row))
        return [self._group_view(g | {"members": members[g["id"]]}) for g in groups]

    @transaction()
    def create_group(self, conn, actor, name):
        self._user(conn, actor)
        if not name.strip() or len(name) > 80:
            raise DomainError("INVALID_INPUT", "Group name must contain 1 to 80 characters.")
        group_id = conn.execute(
            "SELECT create_splix_group(%s,%s) AS id", (uid(actor), name.strip())
        ).fetchone()["id"]
        return self._group_view(self._group(conn, actor, group_id))

    @transaction()
    def archive_group(self, conn, actor, group_id):
        group = self._group(conn, actor, group_id, owner=True, lock=True)
        if not group["archived_at"]:
            conn.execute("SELECT archive_group(%s,%s)", (uid(group_id), uid(actor)))
        return self._group_view(self._group(conn, actor, group_id))

    @transaction()
    def add_member(self, conn, actor, group_id, email):
        self._group(conn, actor, group_id, owner=True, lock=True)
        conn.execute("SELECT add_splix_member(%s,%s,%s)", (uid(group_id), uid(actor), email))
        return self._group_view(self._group(conn, actor, group_id))

    @transaction()
    def create_join_code(self, conn, actor, group_id, ttl_seconds=86400):
        group = self._group(conn, actor, group_id, owner=True, lock=True)
        if group["archived_at"] or not 60 <= ttl_seconds <= 604800:
            raise DomainError(
                "INVALID_INPUT", "Choose an active group and an expiry of 1 minute to 7 days."
            )
        code, expiry = token_hex(16), datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        conn.execute(
            "SELECT create_group_join_code(%s,%s,%s,%s)",
            (uid(group_id), uid(actor), digest(code), expiry),
        )
        return {"code": code, "expiresAt": expiry.timestamp()}

    @staticmethod
    def _join_view(row):
        return {
            "id": str(row["id"]),
            "groupId": str(row["group_id"]),
            "userId": str(row["user_id"]),
            "status": row["status"],
        }

    @transaction()
    def join_group(self, conn, actor, code):
        self._user(conn, actor)
        invite = conn.execute(
            "SELECT * FROM group_join_codes WHERE code_hash=%s AND revoked_at IS NULL AND expires_at>now()",
            (digest(code),),
        ).fetchone()
        if not invite:
            raise DomainError("CONFLICT", "Join code is invalid, expired, or revoked.")
        # Serialise requests/approvals/archival on the same group row via the owner.
        group = conn.execute(
            "SELECT owner_id FROM groups WHERE id=%s", (invite["group_id"],)
        ).fetchone()
        self._group(conn, group["owner_id"], invite["group_id"], lock=True)
        if conn.execute(
            "SELECT 1 FROM group_members WHERE group_id=%s AND user_id=%s",
            (invite["group_id"], uid(actor)),
        ).fetchone():
            return {"status": "approved", "groupId": str(invite["group_id"])}
        request = conn.execute(
            "SELECT * FROM group_join_requests WHERE group_id=%s AND user_id=%s AND status='pending'",
            (invite["group_id"], uid(actor)),
        ).fetchone()
        if not request:
            request_id = conn.execute(
                "SELECT request_group_join(%s,%s) AS id", (uid(actor), digest(code))
            ).fetchone()["id"]
            request = conn.execute(
                "SELECT * FROM group_join_requests WHERE id=%s", (request_id,)
            ).fetchone()
        return self._join_view(request)

    @transaction(read_only=True)
    def list_join_requests(self, conn, actor, group_id):
        self._group(conn, actor, group_id, owner=True)
        rows = conn.execute(
            "SELECT r.*,u.email,u.display_name FROM group_join_requests r JOIN users u ON u.id=r.user_id WHERE r.group_id=%s AND r.status='pending' ORDER BY r.requested_at,r.id",
            (uid(group_id),),
        ).fetchall()
        return [
            self._join_view(r)
            | {
                "user": public(
                    {"id": r["user_id"], "email": r["email"], "display_name": r["display_name"]}
                )
            }
            for r in rows
        ]

    @transaction()
    def decide_join(self, conn, actor, group_id, request_id, approve):
        self._group(conn, actor, group_id, owner=True, lock=True)
        conn.execute(
            "SELECT decide_group_join(%s,%s,%s,%s)",
            (uid(group_id), uid(request_id), uid(actor), approve),
        )
        return self._join_view(
            conn.execute(
                "SELECT * FROM group_join_requests WHERE id=%s", (uid(request_id),)
            ).fetchone()
        )

    @transaction()
    def revoke_join_code(self, conn, actor, code):
        invite = conn.execute(
            "SELECT * FROM group_join_codes WHERE code_hash=%s", (digest(code),)
        ).fetchone()
        if not invite:
            raise DomainError("NOT_FOUND", "Join code not found.")
        self._group(conn, actor, invite["group_id"], owner=True, lock=True)
        conn.execute(
            "SELECT revoke_group_join_code(%s,%s,%s)",
            (invite["group_id"], invite["id"], uid(actor)),
        )
        return {"revoked": True}

    @staticmethod
    def _balances(conn, group_id):
        return [
            {"userId": str(r["user_id"]), "balancePaise": str(r["balance_paise"])}
            for r in conn.execute(
                "SELECT user_id,balance_paise FROM member_balances WHERE group_id=%s ORDER BY user_id",
                (uid(group_id),),
            )
        ]

    @transaction(read_only=True)
    def balances(self, conn, actor, group_id):
        self._group(conn, actor, group_id)
        return self._balances(conn, group_id)

    @staticmethod
    def _events(
        conn,
        group_id,
        event_id=None,
        *,
        limit=None,
        offset=0,
        query="",
        kind=None,
        start=None,
        end=None,
    ):
        rows = conn.execute(
            """SELECT e.*,COALESCE(x.amount_paise,s.amount_paise,0) AS amount,
          x.payer_id,x.title,x.note,c.name AS category,s.from_user_id,s.to_user_id,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',sh.user_id,'amountPaise',sh.share_paise::text) ORDER BY sh.user_id)
            FROM expense_shares sh WHERE sh.expense_event_id=e.id),'[]'::jsonb) AS shares
          FROM financial_events e LEFT JOIN expenses x ON x.event_id=e.id
          LEFT JOIN categories c ON c.id=x.category_id LEFT JOIN settlements s ON s.event_id=e.id
          WHERE e.group_id=%s AND (%s::uuid IS NULL OR e.id=%s::uuid)
          AND (%s='' OR position(lower(%s) in lower(concat_ws(' ',e.id::text,e.kind,e.actor_id::text,e.effective_date::text,x.title,x.note,c.name,x.payer_id::text,s.from_user_id::text,s.to_user_id::text,COALESCE(x.amount_paise,s.amount_paise)::text)))>0)
          AND (%s::text IS NULL OR e.kind=%s)
          AND (%s::date IS NULL OR e.effective_date>=%s::date)
          AND (%s::date IS NULL OR e.effective_date<%s::date)
          ORDER BY e.recorded_at DESC,e.id DESC LIMIT %s OFFSET %s""",
            (
                uid(group_id),
                uid(event_id) if event_id else None,
                uid(event_id) if event_id else None,
                query,
                query,
                kind,
                kind,
                start,
                start,
                end,
                end,
                limit,
                offset,
            ),
        ).fetchall()
        result = []
        for r in rows:
            row = {
                "id": str(r["id"]),
                "group_id": str(r["group_id"]),
                "kind": r["kind"],
                "actor_id": str(r["actor_id"]),
                "effective_date": r["effective_date"].isoformat(),
                "recorded_at": r["recorded_at"].isoformat(),
                "amountPaise": str(r["amount"]),
                "shares": r["shares"],
            }
            for source, target in (
                ("payer_id", "payerId"),
                ("from_user_id", "fromUserId"),
                ("to_user_id", "toUserId"),
                ("reverses_event_id", "reversesEventId"),
                ("correction_of_event_id", "correctionOfEventId"),
                ("title", "title"),
                ("note", "note"),
                ("category", "category"),
                ("reason", "reason"),
            ):
                if r[source] is not None:
                    row[target] = str(r[source])
            result.append(row)
        return result

    def _once(self, conn, actor, group_id, key, payload, work):
        if not isinstance(key, str) or not 1 <= len(key) <= 160:
            raise DomainError("INVALID_INPUT", "A stable request key is required.")
        fingerprint = sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        params = (uid(actor), uid(group_id), key)
        old = conn.execute(
            "SELECT request_hash,response_json FROM idempotency_requests WHERE actor_id=%s AND group_id=%s AND request_key=%s",
            params,
        ).fetchone()
        if old:
            if old["request_hash"] != fingerprint:
                raise DomainError(
                    "DUPLICATE_REQUEST", "Idempotency key was reused with a different request."
                )
            return old["response_json"]
        conn.execute(
            "INSERT INTO idempotency_requests(actor_id,group_id,request_key,request_hash) VALUES(%s,%s,%s,%s)",
            (*params, fingerprint),
        )
        result = work()
        event_id = result.get("id") or result["replacement"]["id"]
        conn.execute(
            "UPDATE idempotency_requests SET result_event_id=%s,response_json=%s WHERE actor_id=%s AND group_id=%s AND request_key=%s",
            (uid(event_id), Jsonb(result), *params),
        )
        return result

    @staticmethod
    def _expense_data(conn, group, data):
        AppService._validate_financial(data)
        amount, shares = prepare_expense({u["id"] for u in group["members"]}, data)
        weights = {x["userId"]: x["weight"] for x in data.get("weights", [])}
        percentages = {x["userId"]: x["basisPoints"] for x in data.get("percentages", [])}
        rows = [
            {
                "user_id": s.user_id,
                "share_paise": s.amount_paise,
                "percentage_bps": percentages.get(s.user_id)
                if data["splitMethod"] == "percentage"
                else None,
                "weight_value": weights.get(s.user_id)
                if data["splitMethod"] == "weighted"
                else None,
            }
            for s in shares
        ]
        category = conn.execute("SELECT splix_category(%s) AS id", (data["category"],)).fetchone()[
            "id"
        ]
        return (
            amount,
            category,
            Jsonb(rows if data["splitMethod"] == "weighted" else {"shares": rows}),
        )

    @transaction()
    def post_expense(self, conn, actor, group_id, data, key):
        group = self._group(conn, actor, group_id, lock=True)

        def work():
            if group["archived_at"]:
                raise DomainError("CONFLICT", "Archived groups cannot accept financial writes.")
            amount, category, shares = self._expense_data(conn, group, data)
            args = (
                uid(group_id),
                uid(actor),
                uid(data["payerId"]),
                date.fromisoformat(data["effectiveDate"]),
                data["title"],
                category,
                amount,
            )
            if data["splitMethod"] == "weighted":
                row = conn.execute(
                    "SELECT post_weighted_expense(%s,%s,%s,%s,%s,%s::smallint,%s,%s,%s) AS id",
                    (*args, data.get("note"), shares),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT post_expense_with_note(%s,%s,%s,%s,%s,%s::smallint,%s,%s,%s,%s) AS id",
                    (*args, data["splitMethod"], shares, data.get("note")),
                ).fetchone()
            return self._events(conn, group_id, row["id"])[0]

        return self._once(conn, actor, group_id, key, {"operation": "expense", "data": data}, work)

    @transaction()
    def post_settlement(self, conn, actor, group_id, data, key):
        group = self._group(conn, actor, group_id, lock=True)

        def work():
            if group["archived_at"]:
                raise DomainError("CONFLICT", "Archived groups cannot accept financial writes.")
            AppService._validate_financial(data)
            row = conn.execute(
                "SELECT post_settlement(%s,%s,%s,%s,%s,%s,NULL) AS id",
                (
                    uid(group_id),
                    uid(actor),
                    date.fromisoformat(data["effectiveDate"]),
                    uid(data["fromUserId"]),
                    uid(data["toUserId"]),
                    int(data["amountPaise"]),
                ),
            ).fetchone()
            return self._events(conn, group_id, row["id"])[0]

        return self._once(
            conn, actor, group_id, key, {"operation": "settlement", "data": data}, work
        )

    @transaction()
    def correct_expense(self, conn, actor, group_id, event_id, replacement, reason, key):
        group = self._group(conn, actor, group_id, lock=True)

        def work():
            if group["archived_at"]:
                raise DomainError("CONFLICT", "Archived groups cannot accept corrections.")
            if not reason.strip() or len(reason) > 1000:
                raise DomainError("INVALID_INPUT", "A correction reason is required.")
            amount, category, shares = self._expense_data(conn, group, replacement)
            row = conn.execute(
                "SELECT * FROM correct_expense(%s,%s,%s,%s,%s,%s,%s::smallint,%s,%s,%s,%s,%s)",
                (
                    uid(group_id),
                    uid(event_id),
                    uid(actor),
                    reason,
                    date.fromisoformat(replacement["effectiveDate"]),
                    replacement["title"],
                    category,
                    amount,
                    replacement["splitMethod"],
                    uid(replacement["payerId"]),
                    shares,
                    replacement.get("note"),
                ),
            ).fetchone()
            return {
                "reversal": self._events(conn, group_id, row["reversal_event_id"])[0],
                "replacement": self._events(conn, group_id, row["replacement_event_id"])[0],
            }

        return self._once(
            conn,
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

    @transaction(read_only=True)
    def history(self, conn, actor, group_id):
        self._group(conn, actor, group_id)
        return self._events(conn, group_id)

    @transaction(read_only=True)
    def search_history(self, conn, actor, group_id, query="", limit=25):
        self._group(conn, actor, group_id)
        return self._events(conn, group_id, limit=min(max(limit, 1), 100), query=query)

    @transaction(read_only=True)
    def history_page(self, conn, actor, group_id, query="", limit=25, offset=0):
        self._group(conn, actor, group_id)
        rows = self._events(conn, group_id, limit=limit + 1, offset=offset, query=query)
        return {"items": rows[:limit], "nextOffset": offset + limit if len(rows) > limit else None}

    @transaction(read_only=True)
    def explanation(self, conn, actor, group_id, user_id=None):
        group = self._group(conn, actor, group_id)
        user_id = user_id or actor
        if user_id not in {u["id"] for u in group["members"]}:
            raise DomainError("FORBIDDEN", "User must belong to the group.")
        contributions = {
            str(r["event_id"]): str(r["delta_paise"])
            for r in conn.execute(
                "SELECT event_id,delta_paise FROM ledger_entries WHERE group_id=%s AND user_id=%s",
                (uid(group_id), uid(user_id)),
            )
        }
        return {
            "userId": user_id,
            "events": [
                e | {"contributionPaise": contributions[e["id"]]}
                for e in self._events(conn, group_id)
                if e["id"] in contributions
            ],
        }

    @transaction(read_only=True)
    def suggestions(self, conn, actor, group_id):
        group = self._group(conn, actor, group_id)
        balances = self._balances(conn, group_id)
        debtors = sorted(
            [
                [b["userId"], -int(b["balancePaise"])]
                for b in balances
                if int(b["balancePaise"]) < 0
            ],
            key=lambda x: (-x[1], x[0]),
        )
        creditors = sorted(
            [[b["userId"], int(b["balancePaise"])] for b in balances if int(b["balancePaise"]) > 0],
            key=lambda x: (-x[1], x[0]),
        )
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
        return {"version": group["version"], "suggestions": result}

    @transaction()
    def create_preset(
        self,
        conn,
        actor,
        group_id,
        name,
        split_method,
        participant_ids,
        weights=None,
        percentages=None,
        shares=None,
    ):
        group = self._group(conn, actor, group_id, owner=True, lock=True)
        # Reuse existing domain validation on a bounded group snapshot, never as storage.
        validator = AppService()
        validator.users = {u["id"]: None for u in group["members"]}
        validator.groups[group_id] = Group(
            group_id,
            group["name"],
            str(group["owner_id"]),
            set(validator.users),
            archived=group["archived_at"] is not None,
        )
        preset = validator.create_preset(
            actor, group_id, name, split_method, participant_ids, weights, percentages, shares
        )
        values = {
            "weighted": {x["userId"]: x["weight"] for x in weights or []},
            "percentage": {x["userId"]: x["basisPoints"] for x in percentages or []},
            "exact": {x["userId"]: int(x["amountPaise"]) for x in shares or []},
        }.get(split_method, {})
        field = {
            "weighted": "weight_value",
            "percentage": "percentage_bps",
            "exact": "exact_share_paise",
        }.get(split_method)
        members = [
            {"user_id": user, **({field: values[user]} if field else {})}
            for user in participant_ids
        ]
        preset_id = conn.execute(
            "SELECT save_group_split_preset(%s,%s,NULL,%s,%s,%s) AS id",
            (uid(group_id), uid(actor), name.strip(), split_method, Jsonb(members)),
        ).fetchone()["id"]
        return preset | {"id": str(preset_id)}

    @transaction(read_only=True)
    def list_presets(self, conn, actor, group_id):
        self._group(conn, actor, group_id)
        result = []
        for row in conn.execute(
            "SELECT * FROM group_split_presets WHERE group_id=%s ORDER BY created_at,id",
            (uid(group_id),),
        ).fetchall():
            members = conn.execute(
                "SELECT * FROM group_split_preset_members WHERE preset_id=%s ORDER BY user_id",
                (row["id"],),
            ).fetchall()
            result.append(
                {
                    "id": str(row["id"]),
                    "groupId": str(row["group_id"]),
                    "name": row["name"],
                    "splitMethod": row["split_method"],
                    "participantIds": [str(m["user_id"]) for m in members],
                    "weights": [
                        {"userId": str(m["user_id"]), "weight": m["weight_value"]}
                        for m in members
                        if m["weight_value"] is not None
                    ],
                    "percentages": [
                        {"userId": str(m["user_id"]), "basisPoints": m["percentage_bps"]}
                        for m in members
                        if m["percentage_bps"] is not None
                    ],
                    "shares": [
                        {"userId": str(m["user_id"]), "amountPaise": str(m["exact_share_paise"])}
                        for m in members
                        if m["exact_share_paise"] is not None
                    ],
                }
            )
        return result

    @transaction(read_only=True)
    def monthly_report(self, conn, actor, group_id, month):
        group = self._group(conn, actor, group_id)
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month) or month.startswith("0000"):
            raise DomainError("INVALID_INPUT", "Month must be YYYY-MM.")
        start = date.fromisoformat(month + "-01")
        end = (
            ("infinity" if start.year == 9999 else date(start.year + 1, 1, 1))
            if start.month == 12
            else date(start.year, start.month + 1, 1)
        )
        categories = conn.execute(
            """SELECT c.name,sum(x.amount_paise) AS amount FROM expenses x JOIN financial_events e ON e.id=x.event_id JOIN categories c ON c.id=x.category_id
          WHERE e.group_id=%s AND e.effective_date>=%s AND e.effective_date<%s AND NOT EXISTS(SELECT 1 FROM financial_events r WHERE r.reverses_event_id=e.id) GROUP BY c.name""",
            (uid(group_id), start, end),
        ).fetchall()
        members = conn.execute(
            """SELECT s.user_id,sum(s.share_paise) AS amount FROM expense_shares s JOIN financial_events e ON e.id=s.expense_event_id
          WHERE e.group_id=%s AND e.effective_date>=%s AND e.effective_date<%s AND NOT EXISTS(SELECT 1 FROM financial_events r WHERE r.reverses_event_id=e.id) GROUP BY s.user_id""",
            (uid(group_id), start, end),
        ).fetchall()
        balances = conn.execute(
            """SELECT l.user_id,COALESCE(sum(l.delta_paise) FILTER(WHERE e.effective_date<%s),0) AS opening,
          COALESCE(sum(l.delta_paise) FILTER(WHERE e.effective_date<%s),0) AS closing FROM ledger_entries l JOIN financial_events e ON e.id=l.event_id
          WHERE l.group_id=%s GROUP BY l.user_id""",
            (start, end, uid(group_id)),
        ).fetchall()
        opening = {u["id"]: "0" for u in group["members"]}
        closing = dict(opening)
        for row in balances:
            opening[str(row["user_id"])] = str(row["opening"])
            closing[str(row["user_id"])] = str(row["closing"])
        return {
            "month": month,
            "openingBalances": opening,
            "closingBalances": closing,
            "categories": {r["name"]: str(r["amount"]) for r in categories},
            "memberShares": {str(r["user_id"]): str(r["amount"]) for r in members},
            "settlements": self._events(conn, group_id, kind="settlement", start=start, end=end),
        }
