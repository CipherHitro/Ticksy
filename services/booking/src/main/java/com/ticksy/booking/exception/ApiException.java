package com.ticksy.booking.exception;

import java.util.List;

public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;
    private final List<ValidationErrorDetail> details;

    public ApiException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.details = null;
    }

    public ApiException(ErrorCode errorCode, String message, List<ValidationErrorDetail> details) {
        super(message);
        this.errorCode = errorCode;
        this.details = details;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public List<ValidationErrorDetail> getDetails() {
        return details;
    }

    public record ValidationErrorDetail(String field, String message) {}
}
