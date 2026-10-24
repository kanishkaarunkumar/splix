import os
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from .domain.errors import DomainError
from .service import AppService

router = APIRouter()


def get_service(request: Request):
    return request.app.state.service


Service = Annotated[Any, Depends(get_service)]


def create_app(database_url=None, service_override=None):
    dsn = database_url or os.getenv("DATABASE_URL")
    if service_override is not None:
        backend = service_override
    elif dsn:
        from .postgres import PostgresService

        backend = PostgresService(dsn)
    elif os.getenv("RENDER") == "true" or os.getenv("SPLIX_REQUIRE_DATABASE") == "1":
        raise RuntimeError(
            "DATABASE_URL is required. Configure the PostgreSQL runtime connection before deploying."
        )
    else:
        backend = AppService()

    @asynccontextmanager
    async def lifespan(application):
        current = application.state.service
        if hasattr(current, "open"):
            current.open()
        try:
            yield
        finally:
            if hasattr(current, "close"):
                current.close()

    application = FastAPI(title="Splix API", version="1.2.1", lifespan=lifespan)
    application.state.service = backend
    origins = [
        value.strip()
        for value in os.getenv("SPLIX_ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    ]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    )
    application.include_router(router)
    return application


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
            "UNAVAILABLE": 503,
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
    return safe(lambda: get_service(request).session_user(bearer(request)))


@router.get("/health")
def health(
    service: Service,
):
    return safe(service.health)


@router.post("/api/v1/auth/register")
def register(service: Service, body: Registration):
    return safe(lambda: service.register_session(body.email, body.displayName, body.password))


@router.post("/api/v1/auth/login")
def login(service: Service, body: Credentials):
    return safe(lambda: service.login(body.email, body.password))


@router.post("/api/v1/auth/logout", status_code=204)
def logout(service: Service, request: Request):
    safe(lambda: service.revoke_session(bearer(request)))
    return Response(status_code=204)


@router.post("/api/v1/auth/recovery/request", status_code=202)
def recovery_request(service: Service, body: Email):
    return service.request_recovery(body.email)


@router.post("/api/v1/auth/recovery/confirm")
def recovery_confirm(service: Service, body: Recovery):
    return safe(lambda: service.recover(body.token, body.password))


@router.delete("/api/v1/me")
def delete_me(service: Service, request: Request):
    return safe(lambda: service.delete_account(actor(request)))


@router.patch("/api/v1/me")
def profile(service: Service, body: Profile, request: Request):
    return safe(lambda: service.update_profile(actor(request), body.displayName))


@router.get("/api/v1/me")
def me(service: Service, request: Request):
    return safe(lambda: service.get_profile(actor(request)))


@router.get("/api/v1/groups")
def groups(service: Service, request: Request):
    user_id = actor(request)
    return safe(lambda: service.list_groups(user_id))


@router.post("/api/v1/groups")
def create_group(service: Service, body: Name, request: Request):
    return safe(lambda: service.create_group(actor(request), body.name))


@router.post("/api/v1/groups/{group_id}/members")
def add_member(service: Service, group_id: str, body: Email, request: Request):
    return safe(lambda: service.add_member(actor(request), group_id, body.email))


@router.post("/api/v1/groups/{group_id}/archive")
def archive(service: Service, group_id: str, request: Request):
    return safe(lambda: service.archive_group(actor(request), group_id))


@router.post("/api/v1/groups/{group_id}/join-codes")
def join_code(service: Service, group_id: str, request: Request, ttl_seconds: int = 86400):
    return safe(lambda: service.create_join_code(actor(request), group_id, ttl_seconds))


@router.post("/api/v1/groups/join")
def join(service: Service, body: Join, request: Request):
    return safe(lambda: service.join_group(actor(request), body.code))


@router.get("/api/v1/groups/{group_id}/join-requests")
def join_requests(service: Service, group_id: str, request: Request):
    return safe(lambda: service.list_join_requests(actor(request), group_id))


@router.post("/api/v1/groups/{group_id}/join-requests/{request_id}")
def decide_join(service: Service, group_id: str, request_id: str, body: Decision, request: Request):
    return safe(lambda: service.decide_join(actor(request), group_id, request_id, body.approve))


@router.post("/api/v1/groups/join-codes/{code}/revoke")
def revoke_join(service: Service, code: str, request: Request):
    return safe(lambda: service.revoke_join_code(actor(request), code))


@router.get("/api/v1/groups/{group_id}/balances")
def balances(service: Service, group_id: str, request: Request):
    return safe(lambda: service.balances(actor(request), group_id))


@router.post("/api/v1/groups/{group_id}/expenses")
def expense(
    service: Service,
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


@router.post("/api/v1/groups/{group_id}/settlements")
def settlement(
    service: Service,
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


@router.get("/api/v1/groups/{group_id}/settlement-suggestions")
def suggestions(service: Service, group_id: str, request: Request):
    return safe(lambda: service.suggestions(actor(request), group_id))


@router.get("/api/v1/groups/{group_id}/history")
def history(
    service: Service, group_id: str, request: Request, q: str = "", limit: int = 25, offset: int = 0
):
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(
            422, detail={"code": "INVALID_INPUT", "message": "Invalid history page."}
        )
    return safe(lambda: service.history_page(actor(request), group_id, q, limit, offset))


@router.get("/api/v1/groups/{group_id}/history/search")
def history_search(service: Service, group_id: str, request: Request, q: str = "", limit: int = 25):
    return safe(lambda: service.search_history(actor(request), group_id, q, limit))


@router.get("/api/v1/groups/{group_id}/explanations")
def explanations(service: Service, group_id: str, request: Request, user_id: str | None = None):
    return safe(lambda: service.explanation(actor(request), group_id, user_id))


@router.post("/api/v1/groups/{group_id}/presets")
def preset(service: Service, group_id: str, body: Preset, request: Request):
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


@router.get("/api/v1/groups/{group_id}/presets")
def presets(service: Service, group_id: str, request: Request):
    return safe(lambda: service.list_presets(actor(request), group_id))


@router.get("/api/v1/groups/{group_id}/reports/monthly")
def monthly_report(
    service: Service,
    group_id: str,
    request: Request,
    month: str,
    format: Literal["json", "csv"] = "json",
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


@router.post("/api/v1/groups/{group_id}/expenses/{event_id}/corrections")
def correction(
    service: Service,
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


app = create_app()
service = app.state.service  # Compatibility for local tooling; routes use per-app state.
