from datetime import datetime, timezone
from typing import Any
from pymongo import ASCENDING, DESCENDING, TEXT, ReturnDocument
from pymongo.errors import DuplicateKeyError
from app.core.logging import logger

class EventRepository:
    def __init__(self, db):
        self.collection = db["events"]

    async def ensure_indexes(self):
        await self.collection.create_index("slug", unique=True, name="uq_events_slug")
        await self.collection.create_index([("title", TEXT), ("description", TEXT), ("tags", TEXT)], name="text_events")
        await self.collection.create_index([("status", ASCENDING), ("startsAt", ASCENDING)], name="idx_status_starts")
        await self.collection.create_index([("category", ASCENDING), ("status", ASCENDING), ("startsAt", ASCENDING)], name="idx_category_status_starts")
        await self.collection.create_index([("organizerId", ASCENDING), ("createdAt", DESCENDING)], name="idx_organizer_created")
        await self.collection.create_index([("venue.geo", "2dsphere")], name="idx_venue_geo", sparse=True)

    async def insert(self, doc: dict[str, Any]):
        await self.collection.insert_one(doc)
        return doc

    async def get(self, event_id: str):
        return await self.collection.find_one({"_id": event_id})

    async def update(self, event_id: str, update: dict[str, Any]):
        return await self.collection.find_one_and_update({"_id": event_id}, {"$set": update}, return_document=ReturnDocument.AFTER)

    async def delete_draft(self, event_id: str):
        return await self.collection.find_one_and_delete({"_id": event_id, "status": "DRAFT"})

    async def list_events(self, query: dict[str, Any], page: int, limit: int, sort: str):
        sort_field = sort.lstrip("-")
        direction = DESCENDING if sort.startswith("-") else ASCENDING
        total = await self.collection.count_documents(query)
        cursor = self.collection.find(query).sort([(sort_field, direction)]).skip((page-1)*limit).limit(limit)
        return await cursor.to_list(length=limit), total
