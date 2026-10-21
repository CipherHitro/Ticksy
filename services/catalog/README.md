# Ticksy Catalog Service

Python 3.12 / FastAPI / Pydantic v2 / PyMongo Async API / Strawberry GraphQL / gRPC.
Catalog owns event metadata and ticket tiers only. It never owns seat availability or bookings.

## Local run (PowerShell)

From the repository root, start the Mongo replica set using the integration instructions in `integration/README.md`, then:

```powershell
py -3.12 -m venv services/catalog/.venv
.\services\catalog\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
python -m grpc_tools.protoc -I shared/proto --python_out=services/catalog/app/grpc_server/generated --grpc_python_out=services/catalog/app/grpc_server/generated shared/proto/catalog/v1/catalog.proto
New-Item -ItemType File -Force services/catalog/app/grpc_server/generated/__init__.py
(Get-Content services/catalog/app/grpc_server/generated/catalog_pb2_grpc.py) -replace '^import catalog_pb2 as catalog__pb2', 'from . import catalog_pb2 as catalog__pb2' | Set-Content services/catalog/app/grpc_server/generated/catalog_pb2_grpc.py
Copy-Item services/catalog/.env.example services/catalog/.env
$env:PYTHONPATH = (Resolve-Path services/catalog).Path
uvicorn app.main:app --app-dir services/catalog --reload --port 4002
```

Set `.env` values for your local Auth service. Never add `.env` or private keys to git.

## Endpoints

- `GET /health/live`, `GET /health/ready`
- `GET /api/v1/catalog/events`, `GET /api/v1/catalog/events/{id}`
- `POST /api/v1/catalog/events`, `PUT /api/v1/catalog/events/{id}`
- `POST /api/v1/catalog/events/{id}/publish`, `/cancel`; `DELETE /api/v1/catalog/events/{id}`
- `GET /api/v1/catalog/my/events`, `GET /api/v1/catalog/categories`
- `POST /graphql` (read-only)
- gRPC `ticksy.catalog.v1.CatalogService/GetEventForBooking` on port 50052

REST responses follow Ticksy's `{success,data,meta}` and standard error envelope. The gateway must be updated by its owner to route `/api/v1/catalog/**` and `/graphql` to this service; see `integration/README.md`.

## Important implementation notes

- `PyMongo AsyncMongoClient` is used; Motor is not used.
- Mongo must run as a replica set (single-node is sufficient for development).
- Event publication is implemented without Kafka for Phase 1. Phase 2 event emission is intentionally not enabled yet.
- Generated protobuf modules are build artifacts from `shared/proto/catalog/v1/catalog.proto`.
