package com.ticksy.booking.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateBookingRequest(
    @NotNull(message = "eventId is required")
    String eventId,

    @NotEmpty(message = "seats list must not be empty")
    @Valid
    List<SeatSelectionDto> seats
) {}
