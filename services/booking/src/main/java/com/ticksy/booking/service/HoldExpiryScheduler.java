package com.ticksy.booking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticksy.booking.domain.Booking;
import com.ticksy.booking.domain.BookingItem;
import com.ticksy.booking.domain.BookingStatus;
import com.ticksy.booking.domain.OutboxEvent;
import com.ticksy.booking.repository.BookingItemRepository;
import com.ticksy.booking.repository.BookingRepository;
import com.ticksy.booking.repository.OutboxEventRepository;
import com.ticksy.booking.repository.SeatRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class HoldExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(HoldExpiryScheduler.class);

    private final BookingRepository bookingRepository;
    private final SeatRepository seatRepository;
    private final BookingItemRepository bookingItemRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final RedisHoldService redisHoldService;
    private final ObjectMapper objectMapper;

    public HoldExpiryScheduler(
            BookingRepository bookingRepository,
            SeatRepository seatRepository,
            BookingItemRepository bookingItemRepository,
            OutboxEventRepository outboxEventRepository,
            RedisHoldService redisHoldService,
            ObjectMapper objectMapper) {
        this.bookingRepository = bookingRepository;
        this.seatRepository = seatRepository;
        this.bookingItemRepository = bookingItemRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.redisHoldService = redisHoldService;
        this.objectMapper = objectMapper;
    }

    /**
     * Runs every 30 seconds to clean up expired holds and emit BookingExpired outbox events.
     */
    @Scheduled(fixedDelayString = "${EXPIRY_CHECK_INTERVAL_MS:30000}")
    @Transactional
    public void processExpiredHolds() {
        Instant now = Instant.now();
        List<Booking> expiredBookings = bookingRepository.findByStatusAndHoldExpiresAtBefore(BookingStatus.HELD, now);

        if (expiredBookings.isEmpty()) {
            return;
        }

        log.info("Found {} expired holds to clean up", expiredBookings.size());

        for (Booking booking : expiredBookings) {
            booking.setStatus(BookingStatus.EXPIRED);
            booking.setUpdatedAt(now);
            bookingRepository.save(booking);

            // Free seats in MySQL
            seatRepository.releaseSeatsForBooking(booking.getId());

            // Free seats in Redis
            List<BookingItem> items = bookingItemRepository.findByBookingId(booking.getId());
            List<String> labels = items.stream().map(BookingItem::getSeatLabel).toList();
            redisHoldService.releaseHolds(booking.getEventId(), labels, booking.getId());

            // Write Outbox event for BookingExpired
            recordExpiredOutboxEvent(booking, items);

            log.info("Marked booking {} as EXPIRED and released seats", booking.getId());
        }

        // Also run safety sweep for any seats marked HELD past expiration timestamp
        seatRepository.releaseExpiredSeats(now);
    }

    private void recordExpiredOutboxEvent(Booking booking, List<BookingItem> items) {
        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("bookingId", booking.getId());
        payloadMap.put("userId", booking.getUserId());
        payloadMap.put("eventId", booking.getEventId());
        payloadMap.put("status", "EXPIRED");
        payloadMap.put("items", items.stream().map(i -> Map.of(
                "seatId", i.getSeatId(),
                "tierId", i.getTierId(),
                "seatLabel", i.getSeatLabel()
        )).toList());

        try {
            String jsonPayload = objectMapper.writeValueAsString(payloadMap);
            OutboxEvent event = new OutboxEvent(
                    UUID.randomUUID().toString(),
                    "Booking",
                    booking.getId(),
                    "BookingExpired",
                    jsonPayload,
                    Instant.now()
            );
            outboxEventRepository.save(event);
        } catch (Exception e) {
            log.error("Failed to record BookingExpired outbox event", e);
        }
    }
}
