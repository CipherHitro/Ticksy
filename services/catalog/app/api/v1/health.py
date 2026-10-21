from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])

@router.get("/health/live")
async def live():
    return {"success": True, "data": {"status": "UP"}}

@router.get("/health/ready")
async def ready(request: Request):
    try:
        await request.app.state.mongo.admin.command("ping")
    except Exception:
        return JSONResponse(status_code=503, content={
            "success": False, "code": "UPSTREAM_UNAVAILABLE",
            "message": "MongoDB is unavailable",
            "requestId": getattr(request.state, "request_id", "unknown"),
        })
    return {"success": True, "data": {"status": "UP"}}
