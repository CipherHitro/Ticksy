package com.ticksy.booking.client;

import java.time.Instant;
import java.util.List;

public record CatalogEventDto(
    String eventId,
    String organizerId,
    String title,
    Instant startsAt,
    String status,
    List<CatalogTierDto> tiers
) {
    public record CatalogTierDto(
        String tierId,
        String name,
        int capacity,
        Long priceMinor,
        String currency,
        String seatPrefix
    ) {}
}
