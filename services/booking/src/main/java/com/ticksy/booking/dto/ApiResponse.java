package com.ticksy.booking.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private boolean success;
    private T data;
    private PaginationMeta meta;
    private String code;
    private String message;
    private String requestId;
    private List<?> details;

    public ApiResponse() {}

    public static <T> ApiResponse<T> success(T data) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setSuccess(true);
        resp.setData(data);
        return resp;
    }

    public static <T> ApiResponse<T> success(T data, PaginationMeta meta) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setSuccess(true);
        resp.setData(data);
        resp.setMeta(meta);
        return resp;
    }

    public static <T> ApiResponse<T> error(String code, String message, String requestId) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setSuccess(false);
        resp.setCode(code);
        resp.setMessage(message);
        resp.setRequestId(requestId);
        return resp;
    }

    public static <T> ApiResponse<T> error(String code, String message, String requestId, List<?> details) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setSuccess(false);
        resp.setCode(code);
        resp.setMessage(message);
        resp.setRequestId(requestId);
        resp.setDetails(details);
        return resp;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }

    public PaginationMeta getMeta() {
        return meta;
    }

    public void setMeta(PaginationMeta meta) {
        this.meta = meta;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public List<?> getDetails() {
        return details;
    }

    public void setDetails(List<?> details) {
        this.details = details;
    }

    public record PaginationMeta(int page, int limit, long total) {}
}
