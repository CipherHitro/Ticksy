package com.ticksy.booking.dto;

public record BookingItemDto(
    Long seatId,
    String tierId,
    String seatLabel,
    Long priceMinor
) {}
