package com.ticksy.booking.exception;

import com.ticksy.booking.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private String getOrGenerateRequestId(HttpServletRequest request, HttpServletResponse response) {
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        response.setHeader("X-Request-Id", requestId);
        return requestId;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Void>> handleApiException(ApiException ex, HttpServletRequest request, HttpServletResponse response) {
        String reqId = getOrGenerateRequestId(request, response);
        log.warn("Business error [{}]: {} (requestId={})", ex.getErrorCode(), ex.getMessage(), reqId);
        
        ApiResponse<Void> body;
        if (ex.getDetails() != null && !ex.getDetails().isEmpty()) {
            body = ApiResponse.error(ex.getErrorCode().name(), ex.getMessage(), reqId, ex.getDetails());
        } else {
            body = ApiResponse.error(ex.getErrorCode().name(), ex.getMessage(), reqId);
        }
        return ResponseEntity.status(ex.getErrorCode().getHttpStatus()).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(MethodArgumentNotValidException ex, HttpServletRequest request, HttpServletResponse response) {
        String reqId = getOrGenerateRequestId(request, response);
        List<ApiException.ValidationErrorDetail> details = new ArrayList<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            details.add(new ApiException.ValidationErrorDetail(fe.getField(), fe.getDefaultMessage()));
        }
        log.warn("Validation error: {} (requestId={})", details, reqId);
        ApiResponse<Void> body = ApiResponse.error(ErrorCode.VALIDATION_ERROR.name(), "Validation failed", reqId, details);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthException(AuthenticationException ex, HttpServletRequest request, HttpServletResponse response) {
        String reqId = getOrGenerateRequestId(request, response);
        log.warn("Authentication failed: {} (requestId={})", ex.getMessage(), reqId);
        ApiResponse<Void> body = ApiResponse.error(ErrorCode.UNAUTHENTICATED.name(), "Authentication required or token invalid", reqId);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDeniedException(AccessDeniedException ex, HttpServletRequest request, HttpServletResponse response) {
        String reqId = getOrGenerateRequestId(request, response);
        log.warn("Access denied: {} (requestId={})", ex.getMessage(), reqId);
        ApiResponse<Void> body = ApiResponse.error(ErrorCode.FORBIDDEN.name(), "Access forbidden: insufficient role or ownership", reqId);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(NoResourceFoundException ex, HttpServletRequest request, HttpServletResponse response) {
        String reqId = getOrGenerateRequestId(request, response);
        ApiResponse<Void> body = ApiResponse.error(ErrorCode.NOT_FOUND.name(), "Route or resource not found", reqId);
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneralException(Exception ex, HttpServletRequest request, HttpServletResponse response) {
        String reqId = getOrGenerateRequestId(request, response);
        log.error("Internal server error (requestId=" + reqId + ")", ex);
        ApiResponse<Void> body = ApiResponse.error(ErrorCode.INTERNAL_ERROR.name(), "An unexpected server error occurred", reqId);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
}
