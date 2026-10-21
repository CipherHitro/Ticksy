package com.ticksy.booking.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    TOO_MANY_SEATS(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    FORBIDDEN(HttpStatus.FORBIDDEN),
    NOT_FOUND(HttpStatus.NOT_FOUND),
    EVENT_NOT_FOUND(HttpStatus.NOT_FOUND),
    SEAT_UNAVAILABLE(HttpStatus.CONFLICT),
    EVENT_NOT_ON_SALE(HttpStatus.CONFLICT),
    HOLD_EXPIRED(HttpStatus.CONFLICT),
    CONFLICT(HttpStatus.CONFLICT),
    UPSTREAM_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus httpStatus;

    ErrorCode(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
