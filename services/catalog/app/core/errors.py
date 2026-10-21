from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from uuid import uuid4

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid4())

async def http_error_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"success": False, **detail, "requestId": _request_id(request)})

async def validation_error_handler(request: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=400, content={"success": False, "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": details, "requestId": _request_id(request)})
