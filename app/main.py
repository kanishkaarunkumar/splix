from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware
from .domain.errors import DomainError
from .service import AppService

app = FastAPI(title="SplitWise+ API", version="1.0.0"); app.add_middleware(SessionMiddleware, secret_key="change-me-in-production", same_site="lax")
service = AppService()
class Credentials(BaseModel): email: str; password: str = Field(min_length=8)
class Registration(Credentials): displayName: str = Field(min_length=1)
def actor(request: Request):
    token = request.headers.get("Authorization", "").removeprefix("Bearer ") or request.session.get("user_id")
    if token and token in service.sessions: return safe(lambda: service.session_user(token))
    if not request.session.get("user_id"): raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "Login required."})
    return request.session["user_id"]
def safe(call):
    try: return call()
    except DomainError as error:
        status = {"UNAUTHORIZED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404, "INVALID_SPLIT": 422}.get(error.code, 409)
        raise HTTPException(status, detail={"code": error.code, "message": str(error), "fields": error.fields}) from error
@app.post("/api/v1/auth/register")
def register(body: Registration, request: Request): user = safe(lambda: service.register(body.email, body.displayName, body.password)); token = service.issue_session(user["id"]); request.session["user_id"] = user["id"]; return user | {"sessionToken": token}
@app.post("/api/v1/auth/login")
def login(body: Credentials, request: Request): user = safe(lambda: service.authenticate(body.email, body.password)); token = service.issue_session(user["id"]); request.session["user_id"] = user["id"]; return user | {"sessionToken": token}
@app.post("/api/v1/auth/logout", status_code=204)
def logout(request: Request):
    token = request.headers.get("Authorization", "").removeprefix("Bearer "); service.revoke_session(token); request.session.clear(); return Response(status_code=204)
@app.post("/api/v1/auth/recovery/request")
def recovery_request(body: dict): return service.request_recovery(body["email"])
@app.post("/api/v1/auth/recovery/confirm")
def recovery_confirm(body: dict): return safe(lambda: service.recover(body["token"], body["password"]))
@app.delete("/api/v1/me")
def delete_me(request: Request): return safe(lambda: service.delete_account(actor(request)))
@app.get("/api/v1/me")
def me(request: Request): return service._public(service.users[actor(request)])
@app.get("/api/v1/groups")
def groups(request: Request): return [service.group_view(g) for g in service.groups.values() if actor(request) in g.member_ids]
@app.post("/api/v1/groups")
def create_group(body: dict, request: Request): return service.create_group(actor(request), body["name"])
@app.post("/api/v1/groups/{group_id}/members")
def add_member(group_id: str, body: dict, request: Request): return safe(lambda: service.add_member(actor(request), group_id, body["email"]))
@app.post("/api/v1/groups/{group_id}/archive")
def archive(group_id: str, request: Request): return safe(lambda: service.archive_group(actor(request), group_id))
@app.post("/api/v1/groups/{group_id}/join-codes")
def join_code(group_id: str, request: Request, ttl_seconds: int = 86400): return safe(lambda: service.create_join_code(actor(request), group_id, ttl_seconds))
@app.post("/api/v1/groups/join")
def join(body: dict, request: Request): return safe(lambda: service.join_group(actor(request), body["code"]))
@app.post("/api/v1/groups/join-codes/{code}/revoke")
def revoke_join(code: str, request: Request): return safe(lambda: service.revoke_join_code(actor(request), code))
@app.get("/api/v1/groups/{group_id}/balances")
def balances(group_id: str, request: Request): return safe(lambda: service.balances(actor(request), group_id))
@app.post("/api/v1/groups/{group_id}/expenses")
def expense(group_id: str, body: dict, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key")): return safe(lambda: service.post_expense(actor(request), group_id, body, idempotency_key))
@app.post("/api/v1/groups/{group_id}/settlements")
def settlement(group_id: str, body: dict, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key")): return safe(lambda: service.post_settlement(actor(request), group_id, body, idempotency_key))
@app.get("/api/v1/groups/{group_id}/settlement-suggestions")
def suggestions(group_id: str, request: Request): return safe(lambda: service.suggestions(actor(request), group_id))
@app.get("/api/v1/groups/{group_id}/history")
def history(group_id: str, request: Request): return safe(lambda: service.history(actor(request), group_id))
@app.get("/api/v1/groups/{group_id}/history/search")
def history_search(group_id: str, request: Request, q: str = "", limit: int = 25): return safe(lambda: service.search_history(actor(request), group_id, q, limit))
@app.get("/api/v1/groups/{group_id}/explanations")
def explanations(group_id: str, request: Request, user_id: str | None = None): return safe(lambda: service.explanation(actor(request), group_id, user_id))
@app.post("/api/v1/groups/{group_id}/presets")
def preset(group_id: str, body: dict, request: Request): return safe(lambda: service.create_preset(actor(request), group_id, body["name"], body["splitMethod"], body["participantIds"], body.get("weights")))
@app.get("/api/v1/groups/{group_id}/presets")
def presets(group_id: str, request: Request): return safe(lambda: service.list_presets(actor(request), group_id))
@app.get("/api/v1/groups/{group_id}/reports/monthly")
def monthly_report(group_id: str, request: Request, month: str, format: str = "json"):
    report = safe(lambda: service.monthly_report(actor(request), group_id, month))
    return PlainTextResponse(service.report_csv(report), media_type="text/csv") if format == "csv" else report
@app.post("/api/v1/groups/{group_id}/expenses/{event_id}/corrections")
def correction(group_id: str, event_id: str, body: dict, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key")):
    return safe(lambda: service.correct_expense(actor(request), group_id, event_id, body["replacement"], body["reason"], idempotency_key))
