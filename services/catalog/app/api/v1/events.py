from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from app.core.security import Principal, optional_principal, require_roles, required_principal
from app.models.events import EventCreate, EventUpdate
from app.services.events import EventService, CATEGORIES

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])
def service(request: Request) -> EventService: return request.app.state.event_service

def response(data, meta=None):
    out = {"success": True, "data": data}
    if meta is not None: out["meta"] = meta
    return out

@router.get("/events")
async def list_events(request: Request, q: str | None = None, category: str | None = None,
 city: str | None = None, from_date: datetime | None = Query(default=None, alias="from"),
 to_date: datetime | None = Query(default=None, alias="to"), min_price: int | None = Query(default=None, alias="minPrice", ge=0),
 max_price: int | None = Query(default=None, alias="maxPrice", ge=0), organizer_id: str | None = Query(default=None, alias="organizerId"),
 sort: str = "startsAt", page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=50),
 principal: Principal | None = Depends(optional_principal)):
    repo = request.app.state.event_repository
    if principal and principal.role == "ADMIN":
        filt: dict[str, Any] = {}
    elif principal and principal.role == "ORGANIZER":
        filt = {"$or": [{"status": "PUBLISHED"}, {"organizerId": principal.sub}]}
    else:
        filt = {"status": "PUBLISHED"}
    if q: filt["$text"] = {"$search":q}
    if category: filt["category"] = category
    if city: filt["venue.city"] = {"$regex":f"^{city}$", "$options":"i"}
    if organizer_id: filt["organizerId"] = organizer_id
    if from_date or to_date:
        filt["startsAt"] = {}
        if from_date: filt["startsAt"]["$gte"] = from_date.astimezone(timezone.utc)
        if to_date: filt["startsAt"]["$lte"] = to_date.astimezone(timezone.utc)
    if min_price is not None or max_price is not None:
        price = {}
        if min_price is not None: price["$gte"] = min_price
        if max_price is not None: price["$lte"] = max_price
        filt["ticketTiers.priceMinor"] = price
    if sort.lstrip("-") not in {"startsAt", "createdAt", "title", "updatedAt", "fromPriceMinor"}: raise HTTPException(400, {"code":"VALIDATION_ERROR","message":"Unsupported sort field"})
    docs, total = await repo.list_events(filt, page, limit, sort)
    from app.services.events import public_doc
    return response([public_doc(d) for d in docs], {"page":page,"limit":limit,"total":total})

@router.get("/events/{event_id}")
async def get_event(event_id: str, request: Request, principal: Principal | None = Depends(optional_principal)):
    return response(await service(request).get_visible(event_id, principal))

@router.post("/events", status_code=201)
async def create_event(data: EventCreate, request: Request, principal: Principal = Depends(require_roles("ORGANIZER","ADMIN"))):
    return response(await service(request).create(data, principal))

@router.put("/events/{event_id}")
async def update_event(event_id: str, data: EventUpdate, request: Request, principal: Principal = Depends(require_roles("ORGANIZER","ADMIN"))):
    return response(await service(request).update(event_id, data, principal))

@router.post("/events/{event_id}/publish")
async def publish_event(event_id: str, request: Request, principal: Principal = Depends(require_roles("ORGANIZER","ADMIN"))):
    return response(await service(request).publish(event_id, principal))

@router.post("/events/{event_id}/cancel")
async def cancel_event(event_id: str, request: Request, principal: Principal = Depends(require_roles("ORGANIZER","ADMIN"))):
    return response(await service(request).cancel(event_id, principal))

@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: str, request: Request, principal: Principal = Depends(require_roles("ORGANIZER","ADMIN"))):
    svc = service(request); doc = await svc.repo.get(event_id); svc._assert_owner(doc, principal)
    if doc["status"] != "DRAFT": raise HTTPException(409, {"code":"INVALID_EVENT_STATE","message":"Only DRAFT events can be deleted"})
    deleted = await svc.repo.delete_draft(event_id)
    if not deleted: raise HTTPException(409, {"code":"CONFLICT","message":"Event could not be deleted"})
    return Response(status_code=204)

@router.get("/my/events")
async def my_events(request: Request, page: int = Query(1,ge=1), limit: int = Query(20,ge=1,le=50), principal: Principal = Depends(require_roles("ORGANIZER","ADMIN"))):
    docs,total = await request.app.state.event_repository.list_events({"organizerId":principal.sub},page,limit,"-createdAt")
    from app.services.events import public_doc
    return response([public_doc(d) for d in docs], {"page":page,"limit":limit,"total":total})

@router.get("/categories")
async def categories(): return response(CATEGORIES)
