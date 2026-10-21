from datetime import datetime
import strawberry
from strawberry.types import Info
from strawberry.fastapi import GraphQLRouter
from strawberry.extensions import DisableIntrospection, QueryDepthLimiter
from strawberry.schema.config import StrawberryConfig
from app.core.config import settings
from fastapi import Request
from app.services.events import public_doc

@strawberry.type
class VenueType:
    name: str
    address: str
    city: str
    state: str
    country: str

@strawberry.type
class TicketTierType:
    tier_id: str
    name: str
    description: str
    price_minor: int
    currency: str
    capacity: int
    seat_prefix: str

@strawberry.type
class EventType:
    id: str
    title: str
    slug: str
    description: str
    category: str
    tags: list[str]
    status: str
    starts_at: datetime
    ends_at: datetime
    venue: VenueType
    ticket_tiers: list[TicketTierType]

def to_event(d):
    def dt(v):
        if v.tzinfo is None: from datetime import timezone; return v.replace(tzinfo=timezone.utc)
        return v
    return EventType(id=d["_id"],title=d["title"],slug=d["slug"],description=d["description"],category=d["category"],tags=d.get("tags",[]),status=d["status"],starts_at=dt(d["startsAt"]),ends_at=dt(d["endsAt"]),venue=VenueType(name=d["venue"]["name"],address=d["venue"]["address"],city=d["venue"]["city"],state=d["venue"]["state"],country=d["venue"]["country"]),ticket_tiers=[TicketTierType(tier_id=t["tierId"],name=t["name"],description=t.get("description",""),price_minor=t["priceMinor"],currency=t["currency"],capacity=t["capacity"],seat_prefix=t["seatPrefix"]) for t in d.get("ticketTiers",[])])

@strawberry.input
class EventFilter:
    category: str | None = None
    city: str | None = None
    q: str | None = None

@strawberry.type
class CategoryType:
    value: str

@strawberry.type
class Query:
    @strawberry.field
    async def events(self, info: Info, filter: EventFilter | None = None, page: int = 1, limit: int = 20) -> list[EventType]:
        if page < 1 or limit < 1 or limit > 50: raise ValueError("page must be positive and limit must be 1..50")
        f={"status":"PUBLISHED"}
        if filter:
            if filter.category: f["category"]=filter.category
            if filter.city: f["venue.city"]={"$regex":f"^{filter.city}$","$options":"i"}
            if filter.q: f["$text"]={"$search":filter.q}
        docs=await info.context["request"].app.state.event_repository.collection.find(f).sort("startsAt",1).skip((page-1)*limit).limit(limit).to_list(length=limit)
        return [to_event(d) for d in docs]
    @strawberry.field
    async def event(self, info: Info, id: str) -> EventType | None:
        d=await info.context["request"].app.state.event_repository.get(id)
        if not d or d["status"] != "PUBLISHED": return None
        return to_event(d)
    @strawberry.field
    def categories(self) -> list[CategoryType]:
        return [CategoryType(value=x) for x in ["music","tech","sports","comedy","workshop","conference","other"]]

schema=strawberry.Schema(query=Query, config=StrawberryConfig(auto_camel_case=True), extensions=([DisableIntrospection(), QueryDepthLimiter(max_depth=8)] if settings.environment.lower() == "production" else [QueryDepthLimiter(max_depth=8)]))
async def context_getter(request: Request): return {"request":request}
graphql_router=GraphQLRouter(schema, context_getter=context_getter, graphql_ide="graphiql" if settings.environment.lower() != "production" else None)
