import os
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from .domain.errors import DomainError
from .service import AppService

app = FastAPI(title="Splix API", version="1.1.0")
origins = [
    value.strip() for value in os.getenv("SPLIX_ALLOWED_ORIGINS", "").split(",") if value.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
service = AppService()


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Body):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=1024)


class Registration(Credentials):
    displayName: str = Field(min_length=1, max_length=80)


class Name(Body):
    name: str = Field(min_length=1, max_length=80)


class Profile(Body):
    displayName: str = Field(min_length=1, max_length=80)


class Email(Body):
    email: str = Field(min_length=3, max_length=254)


class Recovery(Body):
    token: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=8, max_length=1024)


class Join(Body):
    code: str = Field(min_length=1, max_length=128)


class Decision(Body):
    approve: bool


class Percentage(Body):
    userId: str
    basisPoints: int = Field(strict=True, ge=0, le=10000)


class Weight(Body):
    userId: str
    weight: int = Field(strict=True, ge=1, le=1000000)


class Share(Body):
    userId: str
    amountPaise: str = Field(pattern=r"^[0-9]+$", max_length=16)


class Expense(Body):
    amountPaise: str = Field(pattern=r"^[0-9]+$", max_length=16)
    payerId: str
    title: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)
    effectiveDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=1000)
    splitMethod: Literal["equal", "percentage", "weighted", "exact"]
    participantIds: list[str] = Field(default_factory=list, max_length=50)
    percentages: list[Percentage] = Field(default_factory=list, max_length=50)
    weights: list[Weight] = Field(default_factory=list, max_length=50)
    shares: list[Share] = Field(default_factory=list, max_length=50)


class Settlement(Body):
    amountPaise: str = Field(pattern=r"^[0-9]+$", max_length=16)
    fromUserId: str
    toUserId: str
    effectiveDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class Correction(Body):
    replacement: Expense
    reason: str = Field(min_length=1, max_length=1000)


class Preset(Body):
    name: str = Field(min_length=1, max_length=80)
    splitMethod: Literal["equal", "percentage", "weighted", "exact"]
    participantIds: list[str] = Field(min_length=1, max_length=50)
    weights: list[Weight] = Field(default_factory=list, max_length=50)
    percentages: list[Percentage] = Field(default_factory=list, max_length=50)
    shares: list[Share] = Field(default_factory=list, max_length=50)


def safe(call):
    try:
        return call()
    except DomainError as error:
        status = {
            "UNAUTHORIZED": 401,
            "FORBIDDEN": 403,
            "NOT_FOUND": 404,
            "INVALID_INPUT": 422,
            "INVALID_SPLIT": 422,
        }.get(error.code, 409)
        raise HTTPException(
            status, detail={"code": error.code, "message": str(error), "fields": error.fields}
        ) from error


def bearer(request: Request):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "Sign in to continue."})
    return header[7:]


def actor(request: Request):
    return safe(lambda: service.session_user(bearer(request)))


@app.get("/health")
def health():
    return {"status": "ok", "storage": "memory", "productionReady": False}


@app.post("/api/v1/auth/register")
def register(body: Registration):
    user = safe(lambda: service.register(body.email, body.displayName, body.password))
    return user | {"sessionToken": service.issue_session(user["id"])}


@app.post("/api/v1/auth/login")
def login(body: Credentials):
    user = safe(lambda: service.authenticate(body.email, body.password))
    return user | {"sessionToken": service.issue_session(user["id"])}


@app.post("/api/v1/auth/logout", status_code=204)
def logout(request: Request):
    service.revoke_session(bearer(request))
    return Response(status_code=204)


@app.post("/api/v1/auth/recovery/request", status_code=202)
def recovery_request(body: Email):
    return service.request_recovery(body.email)


@app.post("/api/v1/auth/recovery/confirm")
def recovery_confirm(body: Recovery):
    return safe(lambda: service.recover(body.token, body.password))


@app.delete("/api/v1/me")
def delete_me(request: Request):
    return safe(lambda: service.delete_account(actor(request)))


@app.patch("/api/v1/me")
def profile(body: Profile, request: Request):
    return safe(lambda: service.update_profile(actor(request), body.displayName))


@app.get("/api/v1/me")
def me(request: Request):
    return service._public(service.users[actor(request)])


@app.get("/api/v1/groups")
def groups(request: Request):
    user_id = actor(request)
    return [service.group_view(g) for g in service.groups.values() if user_id in g.member_ids]


@app.post("/api/v1/groups")
def create_group(body: Name, request: Request):
    return safe(lambda: service.create_group(actor(request), body.name))


@app.post("/api/v1/groups/{group_id}/members")
def add_member(group_id: str, body: Email, request: Request):
    return safe(lambda: service.add_member(actor(request), group_id, body.email))


@app.post("/api/v1/groups/{group_id}/archive")
def archive(group_id: str, request: Request):
    return safe(lambda: service.archive_group(actor(request), group_id))


@app.post("/api/v1/groups/{group_id}/join-codes")
def join_code(group_id: str, request: Request, ttl_seconds: int = 86400):
    return safe(lambda: service.create_join_code(actor(request), group_id, ttl_seconds))


@app.post("/api/v1/groups/join")
def join(body: Join, request: Request):
    return safe(lambda: service.join_group(actor(request), body.code))


@app.get("/api/v1/groups/{group_id}/join-requests")
def join_requests(group_id: str, request: Request):
    return safe(lambda: service.list_join_requests(actor(request), group_id))


@app.post("/api/v1/groups/{group_id}/join-requests/{request_id}")
def decide_join(group_id: str, request_id: str, body: Decision, request: Request):
    return safe(lambda: service.decide_join(actor(request), group_id, request_id, body.approve))


@app.post("/api/v1/groups/join-codes/{code}/revoke")
def revoke_join(code: str, request: Request):
    return safe(lambda: service.revoke_join_code(actor(request), code))


@app.get("/api/v1/groups/{group_id}/balances")
def balances(group_id: str, request: Request):
    return safe(lambda: service.balances(actor(request), group_id))


@app.post("/api/v1/groups/{group_id}/expenses")
def expense(
    group_id: str,
    body: Expense,
    request: Request,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    return safe(
        lambda: service.post_expense(
            actor(request), group_id, body.model_dump(exclude_none=True), idempotency_key
        )
    )


@app.post("/api/v1/groups/{group_id}/settlements")
def settlement(
    group_id: str,
    body: Settlement,
    request: Request,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    return safe(
        lambda: service.post_settlement(
            actor(request), group_id, body.model_dump(), idempotency_key
        )
    )


@app.get("/api/v1/groups/{group_id}/settlement-suggestions")
def suggestions(group_id: str, request: Request):
    return safe(lambda: service.suggestions(actor(request), group_id))


@app.get("/api/v1/groups/{group_id}/history")
def history(group_id: str, request: Request, q: str = "", limit: int = 25, offset: int = 0):
    rows = safe(lambda: service.history(actor(request), group_id))
    filtered = [e for e in rows if not q or q.lower() in str(e).lower()]
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(
            422, detail={"code": "INVALID_INPUT", "message": "Invalid history page."}
        )
    return {
        "items": filtered[offset : offset + limit],
        "nextOffset": offset + limit if offset + limit < len(filtered) else None,
    }


@app.get("/api/v1/groups/{group_id}/history/search")
def history_search(group_id: str, request: Request, q: str = "", limit: int = 25):
    return safe(lambda: service.search_history(actor(request), group_id, q, limit))


@app.get("/api/v1/groups/{group_id}/explanations")
def explanations(group_id: str, request: Request, user_id: str | None = None):
    return safe(lambda: service.explanation(actor(request), group_id, user_id))


@app.post("/api/v1/groups/{group_id}/presets")
def preset(group_id: str, body: Preset, request: Request):
    return safe(
        lambda: service.create_preset(
            actor(request),
            group_id,
            body.name,
            body.splitMethod,
            body.participantIds,
            [x.model_dump() for x in body.weights],
            [x.model_dump() for x in body.percentages],
            [x.model_dump() for x in body.shares],
        )
    )


@app.get("/api/v1/groups/{group_id}/presets")
def presets(group_id: str, request: Request):
    return safe(lambda: service.list_presets(actor(request), group_id))


@app.get("/api/v1/groups/{group_id}/reports/monthly")
def monthly_report(
    group_id: str, request: Request, month: str, format: Literal["json", "csv"] = "json"
):
    report = safe(lambda: service.monthly_report(actor(request), group_id, month))
    return (
        PlainTextResponse(
            service.report_csv(report),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="splix-{month}.csv"'},
        )
        if format == "csv"
        else report
    )


@app.post("/api/v1/groups/{group_id}/expenses/{event_id}/corrections")
def correction(
    group_id: str,
    event_id: str,
    body: Correction,
    request: Request,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    return safe(
        lambda: service.correct_expense(
            actor(request),
            group_id,
            event_id,
            body.replacement.model_dump(exclude_none=True),
            body.reason,
            idempotency_key,
        )
    )
