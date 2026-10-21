package com.ticksy.booking.dto;

import java.util.List;

public record SeatMapResponseDto(
    String eventId,
    String title,
    String status,
    List<TierSeatsDto> tiers
) {
    public record TierSeatsDto(
        String tierId,
        String name,
        int total,
        int available,
        Long priceMinor,
        String currency,
        List<SeatDetailDto> seats
    ) {}

    public record SeatDetailDto(
        Long id,
        String label,
        String status
    ) {}
}
