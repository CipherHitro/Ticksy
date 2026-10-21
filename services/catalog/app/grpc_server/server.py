import asyncio
from datetime import datetime, timezone
import grpc
from google.protobuf.timestamp_pb2 import Timestamp
from app.core.config import settings
from app.core.logging import logger
from app.grpc_server.generated.catalog.v1 import catalog_pb2, catalog_pb2_grpc

class CatalogGrpcHandler(catalog_pb2_grpc.CatalogServiceServicer):
    def __init__(self, repository): self.repository=repository
    async def GetEventForBooking(self, request, context):
        event=await self.repository.get(request.event_id)
        if not event:
            await context.abort(grpc.StatusCode.NOT_FOUND,"Event not found")
        if event.get("status") != "PUBLISHED":
            await context.abort(grpc.StatusCode.FAILED_PRECONDITION,"Event is not published")
        def ts(value):
            out=Timestamp()
            if value is not None:
                if value.tzinfo is None: value=value.replace(tzinfo=timezone.utc)
                out.FromDatetime(value.astimezone(timezone.utc))
            return out
        result=catalog_pb2.EventForBooking(event_id=event["_id"], title=event["title"], organizer_id=event["organizerId"], status=catalog_pb2.PUBLISHED, starts_at=ts(event["startsAt"]))
        if event.get("saleStartsAt"): result.sale_starts_at.CopyFrom(ts(event["saleStartsAt"]))
        if event.get("saleEndsAt"): result.sale_ends_at.CopyFrom(ts(event["saleEndsAt"]))
        for tier in event.get("ticketTiers",[]):
            result.tiers.add(tier_id=tier["tierId"],name=tier["name"],price_minor=tier["priceMinor"],currency=tier["currency"],capacity=tier["capacity"],seat_prefix=tier["seatPrefix"])
        return result

async def serve(repository, port: int | None = None):
    server=grpc.aio.server()
    catalog_pb2_grpc.add_CatalogServiceServicer_to_server(CatalogGrpcHandler(repository),server)
    bind=f"[::]:{port or settings.grpc_port}"
    server.add_insecure_port(bind)
    await server.start(); logger.info("Catalog gRPC listening on %s",bind)
    await server.wait_for_termination()
