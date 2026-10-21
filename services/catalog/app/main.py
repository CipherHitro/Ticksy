import asyncio
from contextlib import asynccontextmanager
from uuid import uuid4
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from pymongo import AsyncMongoClient
from app.api.v1.events import router as events_router
from app.api.v1.health import router as health_router
from app.core.config import settings
from app.core.errors import http_error_handler, validation_error_handler
from app.core.logging import configure_logging, logger
from app.repositories.events import EventRepository
from app.services.events import EventService
from app.graphql.schema import graphql_router
from app.grpc_server.server import serve as serve_grpc

configure_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    client=AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    app.state.mongo=client
    try:
        await client.admin.command("ping")
        db=client[settings.mongodb_db]
        repo=EventRepository(db)
        await repo.ensure_indexes()
        app.state.event_repository=repo
        app.state.event_service=EventService(repo)
        grpc_task=asyncio.create_task(serve_grpc(repo))
        app.state.grpc_task=grpc_task
        logger.info("Catalog service started; database=%s",settings.mongodb_db)
        yield
    finally:
        task=getattr(app.state,"grpc_task",None)
        if task:
            task.cancel()
            try: await task
            except asyncio.CancelledError: pass
        await client.close()

app=FastAPI(title="Ticksy Catalog",version="0.1.0",lifespan=lifespan)
app.add_exception_handler(StarletteHTTPException,http_error_handler)
app.add_exception_handler(RequestValidationError,validation_error_handler)
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id=request.headers.get("x-request-id") or str(uuid4())
    response=await call_next(request)
    response.headers["x-request-id"]=request.state.request_id
    return response
app.include_router(health_router)
app.include_router(events_router)
app.include_router(graphql_router,prefix="/graphql")
