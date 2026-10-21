package com.ticksy.booking.controller;

import com.ticksy.booking.domain.BookingStatus;
import com.ticksy.booking.dto.*;
import com.ticksy.booking.service.BookingService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    /**
     * Public inventory endpoint to list all available events.
     */
    @GetMapping("/events")
    public ResponseEntity<ApiResponse<java.util.List<EventInventoryResponseDto>>> getEvents() {
        java.util.List<EventInventoryResponseDto> events = bookingService.getAllEvents();
        return ResponseEntity.ok(ApiResponse.success(events));
    }

    /**
     * Public seat map endpoint per tier.
     * HELD seats show as unavailable.
     */
    @GetMapping("/events/{eventId}/seats")
    public ResponseEntity<ApiResponse<SeatMapResponseDto>> getSeatMap(@PathVariable String eventId) {
        SeatMapResponseDto seatMap = bookingService.getSeatMap(eventId);
        return ResponseEntity.ok(ApiResponse.success(seatMap));
    }

    /**
     * Creates a time-limited seat hold.
     * Authenticated endpoint.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<BookingResponseDto>> createHold(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreateBookingRequest request) {

        String userId = jwt.getSubject();
        BookingResponseDto booking = bookingService.createHold(userId, request, idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(booking));
    }

    /**
     * Get authenticated user's own bookings.
     * Note: Per spec, /me MUST be registered before /{id}!
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Iterable<BookingResponseDto>>> getMyBookings(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(value = "status", required = false) BookingStatus status,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {

        String userId = jwt.getSubject();
        int pageZeroIndexed = Math.max(0, page - 1);
        int pageSize = Math.min(Math.max(1, limit), 50);

        Pageable pageable = PageRequest.of(pageZeroIndexed, pageSize, Sort.by("createdAt").descending());
        Page<BookingResponseDto> result = bookingService.getMyBookings(userId, status, pageable);

        ApiResponse.PaginationMeta meta = new ApiResponse.PaginationMeta(page, limit, result.getTotalElements());
        return ResponseEntity.ok(ApiResponse.success(result.getContent(), meta));
    }

    /**
     * Get booking by ID (owner or ADMIN).
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<BookingResponseDto>> getBookingById(
            @PathVariable("id") String bookingId,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();
        boolean isAdmin = jwt.getClaimAsStringList("authorities") != null &&
                jwt.getClaimAsStringList("authorities").contains("ROLE_ADMIN");

        BookingResponseDto booking = bookingService.getBookingById(bookingId, userId, isAdmin);
        return ResponseEntity.ok(ApiResponse.success(booking));
    }

    /**
     * Cancel an active HELD booking and release held seats.
     */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<BookingResponseDto>> cancelBooking(
            @PathVariable("id") String bookingId,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();
        BookingResponseDto booking = bookingService.cancelBooking(bookingId, userId);
        return ResponseEntity.ok(ApiResponse.success(booking));
    }

    /**
     * Phase 3: Transition HELD to PAYMENT_PENDING before invoking Payment Service.
     */
    @PostMapping("/{id}/checkout")
    public ResponseEntity<ApiResponse<BookingResponseDto>> checkoutBooking(
            @PathVariable("id") String bookingId,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();
        BookingResponseDto booking = bookingService.checkoutBooking(bookingId, userId);
        return ResponseEntity.ok(ApiResponse.success(booking));
    }

    /**
     * Dev profile only shortcut: reaches CONFIRMED without Payment Service.
     */
    @PostMapping("/{id}/confirm-dev")
    public ResponseEntity<ApiResponse<BookingResponseDto>> confirmDevBooking(
            @PathVariable("id") String bookingId,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();
        BookingResponseDto booking = bookingService.confirmDevBooking(bookingId, userId);
        return ResponseEntity.ok(ApiResponse.success(booking));
    }

    /**
     * Phase 2: Event organizer or Admin view of all event bookings.
     */
    @GetMapping("/events/{eventId}/bookings")
    public ResponseEntity<ApiResponse<Iterable<BookingResponseDto>>> getEventBookings(
            @PathVariable String eventId,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();
        boolean isAdmin = jwt.getClaimAsStringList("authorities") != null &&
                jwt.getClaimAsStringList("authorities").contains("ROLE_ADMIN");

        Page<BookingResponseDto> page = bookingService.getEventBookings(eventId, userId, isAdmin);
        return ResponseEntity.ok(ApiResponse.success(page.getContent()));
    }
}
