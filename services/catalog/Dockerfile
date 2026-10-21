FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /repo
COPY services/catalog/pyproject.toml services/catalog/README.md ./services/catalog/
COPY services/catalog/app ./services/catalog/app
COPY shared/proto/catalog/v1/catalog.proto ./shared/proto/catalog/v1/catalog.proto
WORKDIR /repo/services/catalog
RUN pip install . && mkdir -p app/grpc_server/generated && \
    python -m grpc_tools.protoc -I../../shared/proto --python_out=app/grpc_server/generated --grpc_python_out=app/grpc_server/generated ../../shared/proto/catalog/v1/catalog.proto && \
    touch app/grpc_server/generated/__init__.py app/grpc_server/generated/catalog/__init__.py app/grpc_server/generated/catalog/v1/__init__.py && \
    sed -i -E 's/from catalog\.v1 import catalog_pb2/from . import catalog_pb2/g' app/grpc_server/generated/catalog/v1/catalog_pb2_grpc.py
ENV PYTHONPATH=/repo/services/catalog:/repo/services/catalog/app/grpc_server/generated
EXPOSE 4002 50052
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-4002}"]
