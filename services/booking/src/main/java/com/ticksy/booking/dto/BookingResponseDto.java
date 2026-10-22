package com.ticksy.booking.dto;

import java.time.Instant;
import java.util.List;

public record BookingResponseDto(
    String bookingId,
    String eventId,
    String userId,
    String status,
    List<BookingItemDto> items,
    Long totalAmountMinor,
    String currency,
    Instant holdExpiresAt,
    String paymentId,
    Instant createdAt,
    String organizerId
) {}
