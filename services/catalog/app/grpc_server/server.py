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
        starts_at = event.get("startsAt")
        if isinstance(starts_at, datetime):
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=timezone.utc)
            starts_at_str = starts_at.isoformat().replace("+00:00", "Z")
        else:
            starts_at_str = str(starts_at or "")

        tier_objs = []
        for tier in event.get("ticketTiers", []):
            tier_objs.append(
                catalog_pb2.TierInfo(
                    tier_id=str(tier["tierId"]),
                    name=str(tier["name"]),
                    capacity=int(tier["capacity"]),
                    price_minor=int(tier["priceMinor"]),
                    currency=str(tier["currency"]),
                    seat_prefix=str(tier["seatPrefix"]),
                )
            )

        return catalog_pb2.GetEventForBookingResponse(
            event_id=str(event["_id"]),
            organizer_id=str(event["organizerId"]),
            title=str(event["title"]),
            starts_at=starts_at_str,
            status=str(event.get("status", "PUBLISHED")),
            tiers=tier_objs,
        )

async def serve(repository, port: int | None = None):
    server=grpc.aio.server()
    catalog_pb2_grpc.add_CatalogServiceServicer_to_server(CatalogGrpcHandler(repository),server)
    bind=f"[::]:{port or settings.grpc_port}"
    server.add_insecure_port(bind)
    await server.start(); logger.info("Catalog gRPC listening on %s",bind)
    await server.wait_for_termination()
