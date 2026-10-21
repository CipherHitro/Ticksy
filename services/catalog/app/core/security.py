from dataclasses import dataclass
from functools import lru_cache
from typing import Any
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import settings

_bearer = HTTPBearer(auto_error=False)

@dataclass(frozen=True)
class Principal:
    sub: str
    role: str
    name: str
    email: str

@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(settings.auth_jwks_url, cache_keys=True, lifespan=300)

def decode_token(token: str) -> Principal:
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        payload: dict[str, Any] = jwt.decode(
            token, signing_key.key, algorithms=["RS256"], issuer=settings.jwt_issuer,
            audience=settings.jwt_audience, options={"require": ["exp", "iss", "aud", "sub"]}
        )
        sub = payload.get("sub")
        role = payload.get("role")
        if not isinstance(sub, str) or not sub or role not in {"ATTENDEE", "ORGANIZER", "ADMIN"}:
            raise jwt.InvalidTokenError("Required claims missing or invalid")
        return Principal(sub=sub, role=role, name=str(payload.get("name") or ""),
                         email=str(payload.get("email") or ""))
    except Exception as exc:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHENTICATED", "message": "Invalid or expired authorization token"}) from exc

async def optional_principal(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal | None:
    if credentials is None:
        return None
    return decode_token(credentials.credentials)

async def required_principal(principal: Principal | None = Depends(optional_principal)) -> Principal:
    if principal is None:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHENTICATED", "message": "Authorization token is required"})
    return principal

def require_roles(*roles: str):
    async def dependency(principal: Principal = Depends(required_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Insufficient permissions"})
        return principal
    return dependency
