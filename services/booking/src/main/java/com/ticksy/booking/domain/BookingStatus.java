package com.ticksy.booking.domain;

import java.util.EnumSet;
import java.util.Set;

public enum BookingStatus {
    HELD,
    PAYMENT_PENDING,
    CONFIRMED,
    EXPIRED,
    CANCELLED,
    FAILED;

    public boolean canTransitionTo(BookingStatus target) {
        if (this == target) {
            return true;
        }
        return switch (this) {
            case HELD -> EnumSet.of(PAYMENT_PENDING, CANCELLED, EXPIRED).contains(target);
            case PAYMENT_PENDING -> EnumSet.of(CONFIRMED, FAILED, EXPIRED).contains(target);
            case CONFIRMED -> false; // refund flow later
            case EXPIRED, CANCELLED, FAILED -> false;
        };
    }
}
