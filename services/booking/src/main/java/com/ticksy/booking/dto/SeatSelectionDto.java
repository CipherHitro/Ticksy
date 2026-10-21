package com.ticksy.booking.dto;

import jakarta.validation.constraints.NotBlank;

public record SeatSelectionDto(
    @NotBlank(message = "tierId is required")
    String tierId,

    @NotBlank(message = "seatLabel is required")
    String seatLabel
) {}
