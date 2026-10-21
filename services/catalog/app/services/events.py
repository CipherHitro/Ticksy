from datetime import datetime, timezone
from uuid import uuid4
from slugify import slugify
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from app.models.events import EventCreate, EventUpdate, EventStatus

CATEGORIES = ["music", "tech", "sports", "comedy", "workshop", "conference", "other"]
def now_utc(): return datetime.now(timezone.utc)
def iso(doc):
    # PyMongo stores datetime as UTC-naive; serialize all timestamps as UTC-aware values.
    for key in ("startsAt", "endsAt", "saleStartsAt", "saleEndsAt", "createdAt", "updatedAt", "publishedAt"):
        value = doc.get(key)
        if isinstance(value, datetime):
            if value.tzinfo is None: value = value.replace(tzinfo=timezone.utc)
            doc[key] = value.isoformat().replace("+00:00", "Z")
    return doc

def public_doc(doc):
    if not doc: return None
    doc = dict(doc)
    doc.pop("_mongo_id", None)
    return iso(doc)

class EventService:
    def __init__(self, repository): self.repo = repository

    async def create(self, data: EventCreate, principal):
        stamp = now_utc()
        base = data.slug or slugify(data.title)
        doc = data.model_dump(by_alias=True, mode="json", exclude={"slug", "ticketTiers"})
        # Restore typed datetime objects for Mongo's date comparisons and sorting.
        doc.update({"_id": str(uuid4()), "slug": base, "organizerId": principal.sub,
                    "organizerName": principal.name, "status": "DRAFT", "createdAt": stamp,
                    "updatedAt": stamp, "publishedAt": None, "version": 1,
                    "ticketTiers": []})
        for tier in data.ticket_tiers:
            doc["ticketTiers"].append({"tierId": str(uuid4()), **tier.model_dump(by_alias=True)})
        # Ensure timestamp fields are BSON datetimes rather than JSON strings.
        for field in ("startsAt", "endsAt", "saleStartsAt", "saleEndsAt"):
            value = getattr(data, {"startsAt":"starts_at", "endsAt":"ends_at", "saleStartsAt":"sale_starts_at", "saleEndsAt":"sale_ends_at"}[field])
            doc[field] = value.astimezone(timezone.utc) if value else None
        try: return public_doc(await self.repo.insert(doc))
        except DuplicateKeyError as exc: raise HTTPException(409, {"code":"CONFLICT", "message":"An event with this slug already exists"}) from exc

    async def get_visible(self, event_id: str, principal=None):
        doc = await self.repo.get(event_id)
        if not doc: raise HTTPException(404, {"code":"NOT_FOUND", "message":"Event not found"})
        if doc["status"] != "PUBLISHED" and not (principal and (principal.role == "ADMIN" or principal.sub == doc["organizerId"])):
            raise HTTPException(404, {"code":"NOT_FOUND", "message":"Event not found"})
        return public_doc(doc)

    async def update(self, event_id: str, data: EventUpdate, principal):
        doc = await self.repo.get(event_id)
        self._assert_owner(doc, principal)
        changes = data.model_dump(by_alias=True, exclude_unset=True, mode="json")
        if "ticketTiers" in changes and changes["ticketTiers"] is not None:
            changes["ticketTiers"] = [{"tierId": str(uuid4()), **tier} for tier in changes["ticketTiers"]]
        if not changes: return public_doc(doc)
        if doc["status"] == "PUBLISHED":
            forbidden = set(changes) - {"title", "description", "posterUrl"}
            if forbidden: raise HTTPException(409, {"code":"CONFLICT", "message":"Published events only allow title, description and posterUrl updates"})
        if doc["status"] in {"CANCELLED", "COMPLETED"}:
            raise HTTPException(409, {"code":"CONFLICT", "message":"This event can no longer be edited"})
        for field in ("startsAt", "endsAt", "saleStartsAt", "saleEndsAt"):
            if field in changes and changes[field] is not None:
                pyfield = {"startsAt":"starts_at", "endsAt":"ends_at", "saleStartsAt":"sale_starts_at", "saleEndsAt":"sale_ends_at"}[field]
                changes[field] = getattr(data, pyfield).astimezone(timezone.utc)
        changes["updatedAt"] = now_utc(); changes["version"] = doc.get("version", 1) + 1
        return public_doc(await self.repo.update(event_id, changes))

    def _assert_owner(self, doc, principal):
        if not doc: raise HTTPException(404, {"code":"NOT_FOUND", "message":"Event not found"})
        if principal.role != "ADMIN" and principal.sub != doc["organizerId"]:
            raise HTTPException(403, {"code":"FORBIDDEN", "message":"You cannot modify another organizer's event"})

    async def publish(self, event_id, principal):
        doc = await self.repo.get(event_id); self._assert_owner(doc, principal)
        if doc["status"] != "DRAFT": raise HTTPException(409, {"code":"CONFLICT", "message":"Only DRAFT events can be published"})
        now = now_utc()
        if not doc.get("ticketTiers"): raise HTTPException(400, {"code":"VALIDATION_ERROR", "message":"At least one ticket tier is required"})
        if doc["startsAt"].replace(tzinfo=timezone.utc) <= now: raise HTTPException(400, {"code":"VALIDATION_ERROR", "message":"startsAt must be in the future"})
        if doc["endsAt"] <= doc["startsAt"]: raise HTTPException(400, {"code":"VALIDATION_ERROR", "message":"endsAt must be after startsAt"})
        if any(t["capacity"] <= 0 or t["priceMinor"] < 0 for t in doc["ticketTiers"]): raise HTTPException(400, {"code":"VALIDATION_ERROR", "message":"Ticket tier capacity must be positive and priceMinor non-negative"})
        if doc.get("saleStartsAt") and doc.get("saleEndsAt") and doc["saleEndsAt"] <= doc["saleStartsAt"]: raise HTTPException(400, {"code":"VALIDATION_ERROR", "message":"saleEndsAt must be after saleStartsAt"})
        return public_doc(await self.repo.update(event_id, {"status":"PUBLISHED", "publishedAt":now, "updatedAt":now, "version":doc.get("version",1)+1}))

    async def cancel(self, event_id, principal):
        doc = await self.repo.get(event_id); self._assert_owner(doc, principal)
        if doc["status"] not in {"DRAFT", "PUBLISHED"}: raise HTTPException(409, {"code":"CONFLICT", "message":"Only DRAFT or PUBLISHED events can be cancelled"})
        return public_doc(await self.repo.update(event_id, {"status":"CANCELLED", "updatedAt":now_utc(), "version":doc.get("version",1)+1}))
