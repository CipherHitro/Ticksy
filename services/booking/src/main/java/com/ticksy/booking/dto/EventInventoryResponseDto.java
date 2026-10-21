package com.ticksy.booking.dto;

import java.util.List;

public record EventInventoryResponseDto(
        String id,
        String title,
        String organizerId,
        String startsAt,
        String status,
        Long minPriceMinor,
        String currency,
        int totalSeats,
        int availableSeats,
        List<TierSummaryDto> tiers
) {
    public record TierSummaryDto(
            String tierId,
            String name,
            Long priceMinor,
            String currency,
            int total,
            int available
    ) {}
}
