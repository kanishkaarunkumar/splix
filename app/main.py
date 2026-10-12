from fastapi import FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware
from .domain.errors import DomainError
from .service import AppService

app = FastAPI(title="SplitWise+ API", version="1.0.0"); app.add_middleware(SessionMiddleware, secret_key="change-me-in-production", same_site="lax")
service = AppService()
class Credentials(BaseModel): email: str; password: str = Field(min_length=8)
class Registration(Credentials): displayName: str = Field(min_length=1)
def actor(request: Request):
    if not request.session.get("user_id"): raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "Login required."})
    return request.session["user_id"]
def safe(call):
    try: return call()
    except DomainError as error:
        status = {"UNAUTHORIZED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404, "INVALID_SPLIT": 422}.get(error.code, 409)
        raise HTTPException(status, detail={"code": error.code, "message": str(error), "fields": error.fields}) from error
@app.post("/api/v1/auth/register")
def register(body: Registration, request: Request): user = safe(lambda: service.register(body.email, body.displayName, body.password)); request.session["user_id"] = user["id"]; return user
@app.post("/api/v1/auth/login")
def login(body: Credentials, request: Request): user = safe(lambda: service.authenticate(body.email, body.password)); request.session["user_id"] = user["id"]; return user
@app.post("/api/v1/auth/logout", status_code=204)
def logout(request: Request): request.session.clear(); return Response(status_code=204)
@app.get("/api/v1/me")
def me(request: Request): return service._public(service.users[actor(request)])
@app.get("/api/v1/groups")
def groups(request: Request): return [service.group_view(g) for g in service.groups.values() if actor(request) in g.member_ids]
@app.post("/api/v1/groups")
def create_group(body: dict, request: Request): return service.create_group(actor(request), body["name"])
@app.post("/api/v1/groups/{group_id}/members")
def add_member(group_id: str, body: dict, request: Request): return safe(lambda: service.add_member(actor(request), group_id, body["email"]))
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
@app.post("/api/v1/groups/{group_id}/expenses/{event_id}/corrections")
def correction(group_id: str, event_id: str, body: dict, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key")):
    return safe(lambda: service.correct_expense(actor(request), group_id, event_id, body["replacement"], body["reason"], idempotency_key))
