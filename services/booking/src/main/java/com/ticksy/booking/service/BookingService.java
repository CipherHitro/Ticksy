package com.ticksy.booking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticksy.booking.client.CatalogEventDto;
import com.ticksy.booking.client.CatalogGrpcClient;
import com.ticksy.booking.domain.*;
import com.ticksy.booking.dto.*;
import com.ticksy.booking.exception.ApiException;
import com.ticksy.booking.exception.ErrorCode;
import com.ticksy.booking.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);

    private final EventInventoryRepository eventInventoryRepository;
    private final SeatRepository seatRepository;
    private final BookingRepository bookingRepository;
    private final BookingItemRepository bookingItemRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final RedisHoldService redisHoldService;
    private final CatalogGrpcClient catalogGrpcClient;
    private final ObjectMapper objectMapper;

    private final long holdTtlSeconds;
    private final int maxSeatsPerBooking;

    public BookingService(
            EventInventoryRepository eventInventoryRepository,
            SeatRepository seatRepository,
            BookingRepository bookingRepository,
            BookingItemRepository bookingItemRepository,
            OutboxEventRepository outboxEventRepository,
            RedisHoldService redisHoldService,
            CatalogGrpcClient catalogGrpcClient,
            ObjectMapper objectMapper,
            @Value("${HOLD_TTL_SECONDS:600}") long holdTtlSeconds,
            @Value("${MAX_SEATS_PER_BOOKING:6}") int maxSeatsPerBooking) {
        this.eventInventoryRepository = eventInventoryRepository;
        this.seatRepository = seatRepository;
        this.bookingRepository = bookingRepository;
        this.bookingItemRepository = bookingItemRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.redisHoldService = redisHoldService;
        this.catalogGrpcClient = catalogGrpcClient;
        this.objectMapper = objectMapper;
        this.holdTtlSeconds = holdTtlSeconds;
        this.maxSeatsPerBooking = maxSeatsPerBooking;
    }

    /**
     * Retrieves the seat map for an event.
     * Implements lazy inventory initialization on first request via Catalog gRPC.
     */
    @Transactional
    public SeatMapResponseDto getSeatMap(String eventId) {
        ensureEventInventoryInitialized(eventId);

        EventInventory inventory = eventInventoryRepository.findById(eventId)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND, "Event inventory not found: " + eventId));

        List<Seat> allSeats = seatRepository.findByEventId(eventId);

        // Group seats by tier
        Map<String, List<Seat>> seatsByTier = allSeats.stream()
                .collect(Collectors.groupingBy(Seat::getTierId));

        Instant now = Instant.now();
        List<SeatMapResponseDto.TierSeatsDto> tierDtos = new ArrayList<>();

        for (Map.Entry<String, List<Seat>> entry : seatsByTier.entrySet()) {
            String tierId = entry.getKey();
            List<Seat> tierSeats = entry.getValue();

            int total = tierSeats.size();
            // Available means status is AVAILABLE or HELD but held_until has expired
            int available = (int) tierSeats.stream()
                    .filter(s -> s.getStatus() == SeatStatus.AVAILABLE ||
                            (s.getStatus() == SeatStatus.HELD && s.getHeldUntil() != null && s.getHeldUntil().isBefore(now)))
                    .count();

            Seat first = tierSeats.getFirst();
            Long priceMinor = first.getPriceMinor();
            String currency = first.getCurrency();

            List<SeatMapResponseDto.SeatDetailDto> seatDetails = tierSeats.stream()
                    .map(s -> {
                        // Per spec: HELD seats show as unavailable to other viewers
                        String displayStatus = (s.getStatus() == SeatStatus.HELD && s.getHeldUntil() != null && s.getHeldUntil().isAfter(now))
                                ? "HELD" : s.getStatus().name();
                        return new SeatMapResponseDto.SeatDetailDto(s.getId(), s.getSeatLabel(), displayStatus);
                    })
                    .sorted(Comparator.comparing(SeatMapResponseDto.SeatDetailDto::label))
                    .toList();

            tierDtos.add(new SeatMapResponseDto.TierSeatsDto(
                    tierId,
                    "Tier " + tierId,
                    total,
                    available,
                    priceMinor,
                    currency,
                    seatDetails
            ));
        }

        return new SeatMapResponseDto(
                inventory.getEventId(),
                inventory.getTitle(),
                inventory.getStatus().name(),
                tierDtos
        );
    }

    /**
     * Creates a time-limited seat hold.
     * Concurrency centerpiece:
     * 1. Validates seats limit (max 6).
     * 2. Checks idempotency.
     * 3. Sorts seat labels to guarantee deadlock freedom.
     * 4. Acquires fast front-door lock in Redis.
     * 5. Executes single conditional update in MySQL with row locks.
     */
    @Transactional
    public BookingResponseDto createHold(String userId, CreateBookingRequest request, String idempotencyKey) {
        List<SeatSelectionDto> requestedSeats = request.seats();

        if (requestedSeats.size() > maxSeatsPerBooking) {
            throw new ApiException(ErrorCode.TOO_MANY_SEATS,
                    "Maximum " + maxSeatsPerBooking + " seats allowed per booking. Requested: " + requestedSeats.size());
        }

        // Check idempotency if key supplied
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Optional<Booking> existing = bookingRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            if (existing.isPresent()) {
                log.info("Idempotent booking hit for user {} with key {}", userId, idempotencyKey);
                return toResponseDto(existing.get());
            }
        }

        ensureEventInventoryInitialized(request.eventId());

        EventInventory inventory = eventInventoryRepository.findById(request.eventId())
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND, "Event not found: " + request.eventId()));

        if (inventory.getStatus() != EventStatus.OPEN && inventory.getStatus() != EventStatus.PUBLISHED) {
            throw new ApiException(ErrorCode.EVENT_NOT_ON_SALE, "Event is not open for bookings");
        }

        // CRITICAL: Sort seats deterministically to eliminate deadlocks on concurrent overlapping requests!
        List<SeatSelectionDto> sortedSeats = requestedSeats.stream()
                .sorted(Comparator.comparing(SeatSelectionDto::tierId).thenComparing(SeatSelectionDto::seatLabel))
                .toList();

        String bookingId = UUID.randomUUID().toString();
        Instant now = Instant.now();
        Instant holdExpiresAt = now.plusSeconds(holdTtlSeconds);

        List<String> seatLabels = sortedSeats.stream().map(SeatSelectionDto::seatLabel).toList();

        // 1. Redis fast front door
        redisHoldService.tryAcquireRedisHolds(request.eventId(), seatLabels, bookingId);

        try {
            // 2. MySQL conditional update source of truth
            List<Seat> heldSeats = new ArrayList<>();
            List<String> failedSeats = new ArrayList<>();

            for (SeatSelectionDto selection : sortedSeats) {
                int updated = seatRepository.holdSeatConditionally(
                        bookingId,
                        holdExpiresAt,
                        request.eventId(),
                        selection.tierId(),
                        selection.seatLabel(),
                        now
                );

                if (updated == 1) {
                    Seat seat = seatRepository.findByEventIdAndTierIdAndSeatLabel(
                            request.eventId(), selection.tierId(), selection.seatLabel())
                            .orElseThrow();
                    heldSeats.add(seat);
                } else {
                    failedSeats.add(selection.seatLabel());
                }
            }

            // Check affected row count equals number of seats requested
            if (!failedSeats.isEmpty() || heldSeats.size() != sortedSeats.size()) {
                log.warn("MySQL hold contention on seats: {} for event {}", failedSeats, request.eventId());
                redisHoldService.releaseHolds(request.eventId(), seatLabels, bookingId);
                throw new ApiException(ErrorCode.SEAT_UNAVAILABLE,
                        "Seats no longer available: " + String.join(", ", failedSeats));
            }

            long totalAmountMinor = heldSeats.stream().mapToLong(Seat::getPriceMinor).sum();
            String currency = heldSeats.getFirst().getCurrency();

            // Create Booking aggregate
            Booking booking = new Booking(
                    bookingId,
                    userId,
                    request.eventId(),
                    BookingStatus.HELD,
                    totalAmountMinor,
                    currency,
                    holdExpiresAt,
                    idempotencyKey,
                    now
            );

            // Create Booking Items
            List<BookingItem> items = new ArrayList<>();
            for (Seat seat : heldSeats) {
                BookingItem item = new BookingItem(
                        bookingId,
                        seat.getId(),
                        seat.getTierId(),
                        seat.getSeatLabel(),
                        seat.getPriceMinor()
                );
                items.add(item);
            }

            booking.setItems(items);
            bookingRepository.save(booking);
            bookingItemRepository.saveAll(items);

            log.info("Booking hold created successfully: {} for user {} (expires: {})", bookingId, userId, holdExpiresAt);
            return toResponseDto(booking);

        } catch (Exception e) {
            // Guarantee Redis keys released if MySQL fails
            redisHoldService.releaseHolds(request.eventId(), seatLabels, bookingId);
            if (e instanceof ApiException) {
                throw (ApiException) e;
            }
            log.error("Failed to execute booking hold transaction", e);
            throw new ApiException(ErrorCode.INTERNAL_ERROR, "Unable to complete seat hold: " + e.getMessage());
        }
    }

    /**
     * Cancels an active HELD booking and immediately releases seats in MySQL and Redis.
     */
    @Transactional
    public BookingResponseDto cancelBooking(String bookingId, String userId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Booking not found: " + bookingId));

        if (!booking.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Not authorized to cancel this booking");
        }

        if (!booking.getStatus().canTransitionTo(BookingStatus.CANCELLED)) {
            throw new ApiException(ErrorCode.CONFLICT, "Cannot cancel booking in status: " + booking.getStatus());
        }

        booking.setStatus(BookingStatus.CANCELLED);
        booking.setUpdatedAt(Instant.now());
        bookingRepository.save(booking);

        // Free seats in MySQL
        seatRepository.releaseSeatsForBooking(bookingId);

        // Free keys in Redis
        List<BookingItem> items = bookingItemRepository.findByBookingId(bookingId);
        List<String> labels = items.stream().map(BookingItem::getSeatLabel).toList();
        redisHoldService.releaseHolds(booking.getEventId(), labels, bookingId);

        // Record outbox event
        saveOutboxEvent("BookingCancelled", booking, items);

        log.info("Booking cancelled: {}", bookingId);
        return toResponseDto(booking);
    }

    /**
     * Dev profile only: confirms a booking without external payment service.
     */
    @Transactional
    public BookingResponseDto confirmDevBooking(String bookingId, String userId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Booking not found: " + bookingId));

        if (!booking.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Not authorized to confirm this booking");
        }

        if (booking.getStatus() == BookingStatus.EXPIRED) {
            throw new ApiException(ErrorCode.HOLD_EXPIRED, "Booking hold has already expired");
        }

        booking.setStatus(BookingStatus.CONFIRMED);
        booking.setPaymentId("pay_dev_" + UUID.randomUUID().toString().substring(0, 8));
        booking.setUpdatedAt(Instant.now());
        bookingRepository.save(booking);

        // Mark seats as permanently SOLD
        seatRepository.markSeatsSoldForBooking(bookingId);

        // Free Redis temporary keys
        List<BookingItem> items = bookingItemRepository.findByBookingId(bookingId);
        List<String> labels = items.stream().map(BookingItem::getSeatLabel).toList();
        redisHoldService.releaseHolds(booking.getEventId(), labels, bookingId);

        // Record outbox event
        saveOutboxEvent("BookingConfirmed", booking, items);

        log.info("Booking confirmed via dev shortcut: {}", bookingId);
        return toResponseDto(booking);
    }

    /**
     * Phase 3 Checkout: transitions HELD to PAYMENT_PENDING.
     */
    @Transactional
    public BookingResponseDto checkoutBooking(String bookingId, String userId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Booking not found: " + bookingId));

        if (!booking.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Not authorized to checkout this booking");
        }

        if (booking.getStatus() == BookingStatus.EXPIRED || booking.getHoldExpiresAt().isBefore(Instant.now())) {
            throw new ApiException(ErrorCode.HOLD_EXPIRED, "Hold has expired");
        }

        if (!booking.getStatus().canTransitionTo(BookingStatus.PAYMENT_PENDING)) {
            throw new ApiException(ErrorCode.CONFLICT, "Cannot checkout booking in status " + booking.getStatus());
        }

        booking.setStatus(BookingStatus.PAYMENT_PENDING);
        booking.setUpdatedAt(Instant.now());
        bookingRepository.save(booking);

        return toResponseDto(booking);
    }

    @Transactional(readOnly = true)
    public Page<BookingResponseDto> getMyBookings(String userId, BookingStatus statusFilter, Pageable pageable) {
        Page<Booking> page = statusFilter != null
                ? bookingRepository.findByUserIdAndStatus(userId, statusFilter, pageable)
                : bookingRepository.findByUserId(userId, pageable);

        return page.map(this::toResponseDto);
    }

    @Transactional(readOnly = true)
    public BookingResponseDto getBookingById(String bookingId, String userId, boolean isAdmin) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Booking not found: " + bookingId));

        if (!isAdmin && !booking.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Not authorized to view this booking");
        }

        return toResponseDto(booking);
    }

    @Transactional(readOnly = true)
    public Page<BookingResponseDto> getEventBookings(String eventId, String userId, boolean isAdmin) {
        // Organizer ownership verification or Admin
        EventInventory inventory = eventInventoryRepository.findById(eventId)
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND, "Event not found: " + eventId));

        if (!isAdmin && !inventory.getOrganizerId().equals(userId)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Only the event organizer or an admin can view event bookings");
        }

        return bookingRepository.findByEventId(eventId, Pageable.unpaged()).map(this::toResponseDto);
    }

    /**
     * Lazy initializes event inventory and seats from Catalog gRPC if not already populated.
     */
    private void ensureEventInventoryInitialized(String eventId) {
        if (eventInventoryRepository.existsById(eventId)) {
            return;
        }

        log.info("Event inventory not present for {}. Initializing lazily via Catalog gRPC...", eventId);
        CatalogEventDto catalogEvent = catalogGrpcClient.getEventForBooking(eventId);

        EventInventory inventory = new EventInventory(
                catalogEvent.eventId(),
                catalogEvent.organizerId(),
                catalogEvent.title(),
                catalogEvent.startsAt(),
                EventStatus.valueOf(catalogEvent.status()),
                Instant.now()
        );

        try {
            eventInventoryRepository.save(inventory);

            List<Seat> seatsToCreate = new ArrayList<>();
            for (CatalogEventDto.CatalogTierDto tier : catalogEvent.tiers()) {
                String prefix = (tier.seatPrefix() != null && !tier.seatPrefix().isBlank()) ? tier.seatPrefix() : "S";
                for (int i = 1; i <= tier.capacity(); i++) {
                    String label = prefix + "-" + i;
                    Seat seat = new Seat(
                            catalogEvent.eventId(),
                            tier.tierId(),
                            label,
                            tier.priceMinor(),
                            tier.currency()
                    );
                    seatsToCreate.add(seat);
                }
            }
            seatRepository.saveAll(seatsToCreate);
            log.info("Successfully initialized {} seats across {} tiers for event {}",
                    seatsToCreate.size(), catalogEvent.tiers().size(), eventId);
        } catch (Exception e) {
            // Concurrent initialization protection: if another thread beat us, that is fine
            log.warn("Inventory already initialized concurrently for event {}: {}", eventId, e.getMessage());
        }
    }

    private void saveOutboxEvent(String eventType, Booking booking, List<BookingItem> items) {
        EventInventory inventory = eventInventoryRepository.findById(booking.getEventId()).orElse(null);
        String organizerId = inventory != null ? inventory.getOrganizerId() : "unknown";

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("bookingId", booking.getId());
        payloadMap.put("userId", booking.getUserId());
        payloadMap.put("eventId", booking.getEventId());
        payloadMap.put("organizerId", organizerId);
        payloadMap.put("totalAmountMinor", booking.getTotalAmountMinor());
        payloadMap.put("currency", booking.getCurrency());
        payloadMap.put("items", items.stream().map(i -> Map.of(
                "seatId", i.getSeatId(),
                "tierId", i.getTierId(),
                "seatLabel", i.getSeatLabel(),
                "priceMinor", i.getPriceMinor()
        )).toList());

        try {
            String jsonPayload = objectMapper.writeValueAsString(payloadMap);
            OutboxEvent event = new OutboxEvent(
                    UUID.randomUUID().toString(),
                    "Booking",
                    booking.getId(),
                    eventType,
                    jsonPayload,
                    Instant.now()
            );
            outboxEventRepository.save(event);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize outbox event payload", e);
        }
    }

    private BookingResponseDto toResponseDto(Booking booking) {
        List<BookingItem> items = booking.getItems();
        if (items == null || items.isEmpty()) {
            items = bookingItemRepository.findByBookingId(booking.getId());
        }

        List<BookingItemDto> itemDtos = items.stream()
                .map(i -> new BookingItemDto(i.getSeatId(), i.getTierId(), i.getSeatLabel(), i.getPriceMinor()))
                .toList();

        return new BookingResponseDto(
                booking.getId(),
                booking.getEventId(),
                booking.getUserId(),
                booking.getStatus().name(),
                itemDtos,
                booking.getTotalAmountMinor(),
                booking.getCurrency(),
                booking.getHoldExpiresAt(),
                booking.getPaymentId(),
                booking.getCreatedAt()
        );
    }
}
