from datetime import datetime, timezone
from enum import Enum
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

class Category(str, Enum):
    music = "music"
    tech = "tech"
    sports = "sports"
    comedy = "comedy"
    workshop = "workshop"
    conference = "conference"
    other = "other"

class EventStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"

class VenueGeo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type: str = "Point"
    coordinates: tuple[float, float]  # [longitude, latitude]

class Venue(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    city: str = Field(min_length=1, max_length=120)
    state: str = Field(min_length=1, max_length=120)
    country: str = Field(min_length=1, max_length=120)
    geo: VenueGeo | None = None

class TicketTierInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    price_minor: int = Field(alias="priceMinor", ge=0)
    currency: str = Field(default="INR", pattern=r"^INR$")
    capacity: int = Field(gt=0, le=1000000)
    seat_prefix: str = Field(default="S", alias="seatPrefix", pattern=r"^[A-Z]{1,4}$")

class TicketTier(TicketTierInput):
    tier_id: str = Field(alias="tierId")

class EventCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: str = Field(min_length=3, max_length=255)
    slug: str | None = Field(default=None, min_length=3, max_length=255)
    description: str = Field(min_length=1, max_length=10000)
    category: Category
    tags: list[str] = Field(default_factory=list, max_length=30)
    venue: Venue
    starts_at: datetime = Field(alias="startsAt")
    ends_at: datetime = Field(alias="endsAt")
    timezone: str = "Asia/Kolkata"
    poster_url: HttpUrl | None = Field(default=None, alias="posterUrl")
    ticket_tiers: list[TicketTierInput] = Field(default_factory=list, alias="ticketTiers", max_length=20)
    sale_starts_at: datetime | None = Field(default=None, alias="saleStartsAt")
    sale_ends_at: datetime | None = Field(default=None, alias="saleEndsAt")

    @model_validator(mode="after")
    def validate_event(self):
        for name in ("starts_at", "ends_at", "sale_starts_at", "sale_ends_at"):
            value = getattr(self, name)
            if value is not None and value.tzinfo is None:
                raise ValueError(f"{name} must include a timezone")
        if self.ends_at <= self.starts_at:
            raise ValueError("endsAt must be after startsAt")
        if self.sale_starts_at and self.sale_ends_at and self.sale_ends_at <= self.sale_starts_at:
            raise ValueError("saleEndsAt must be after saleStartsAt")
        prefixes = [t.seat_prefix for t in self.ticket_tiers]
        if len(prefixes) != len(set(prefixes)):
            raise ValueError("Duplicate seatPrefix across ticket tiers is not allowed")
        if self.poster_url and self.poster_url.scheme != "https":
            raise ValueError("posterUrl must use https scheme")
        return self

class EventUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=10000)
    poster_url: HttpUrl | None = Field(default=None, alias="posterUrl")
    category: Category | None = None
    tags: list[str] | None = Field(default=None, max_length=30)
    venue: Venue | None = None
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    timezone: str | None = None
    ticket_tiers: list[TicketTierInput] | None = Field(default=None, alias="ticketTiers", max_length=20)
    sale_starts_at: datetime | None = Field(default=None, alias="saleStartsAt")
    sale_ends_at: datetime | None = Field(default=None, alias="saleEndsAt")

    @model_validator(mode="after")
    def validate_update(self):
        for name in ("starts_at", "ends_at", "sale_starts_at", "sale_ends_at"):
            value = getattr(self, name)
            if value is not None and value.tzinfo is None:
                raise ValueError(f"{name} must include a timezone")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("endsAt must be after startsAt")
        if self.sale_starts_at and self.sale_ends_at and self.sale_ends_at <= self.sale_starts_at:
            raise ValueError("saleEndsAt must be after saleStartsAt")
        if self.ticket_tiers:
            prefixes = [t.seat_prefix for t in self.ticket_tiers]
            if len(prefixes) != len(set(prefixes)):
                raise ValueError("Duplicate seatPrefix across ticket tiers is not allowed")
        if self.poster_url and self.poster_url.scheme != "https":
            raise ValueError("posterUrl must use https scheme")
        return self

class EventOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    id: str = Field(alias="_id")
