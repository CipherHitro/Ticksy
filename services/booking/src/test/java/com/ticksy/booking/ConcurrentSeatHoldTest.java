package com.ticksy.booking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticksy.booking.client.CatalogEventDto;
import com.ticksy.booking.client.CatalogGrpcClient;
import com.ticksy.booking.domain.*;
import com.ticksy.booking.dto.BookingResponseDto;
import com.ticksy.booking.dto.CreateBookingRequest;
import com.ticksy.booking.dto.SeatSelectionDto;
import com.ticksy.booking.exception.ApiException;
import com.ticksy.booking.exception.ErrorCode;
import com.ticksy.booking.repository.*;
import com.ticksy.booking.service.BookingService;
import com.ticksy.booking.service.HoldExpiryScheduler;
import com.ticksy.booking.service.RedisHoldService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;

@SpringBootTest
@ActiveProfiles("test")
public class ConcurrentSeatHoldTest {

    @Autowired
    private EventInventoryRepository eventInventoryRepository;

    @Autowired
    private SeatRepository seatRepository;

    @Autowired
    private BookingRepository bookingRepository;

    @Autowired
    private BookingItemRepository bookingItemRepository;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private RedisHoldService redisHoldService;

    @MockBean
    private CatalogGrpcClient catalogGrpcClient;

    @Autowired
    private BookingService bookingService;

    @Autowired
    private HoldExpiryScheduler holdExpiryScheduler;

    private static final String EVENT_ID = "evt-concurrency-test";

    @BeforeEach
    void setUp() {
        bookingItemRepository.deleteAll();
        bookingRepository.deleteAll();
        seatRepository.deleteAll();
        eventInventoryRepository.deleteAll();
        outboxEventRepository.deleteAll();

        // Mock Redis to simulate fast front-door lock
        Map<String, String> redisMemory = new ConcurrentHashMap<>();
        Mockito.when(redisHoldService.tryAcquireRedisHolds(anyString(), any(), anyString()))
                .thenAnswer(invocation -> {
                    String eventId = invocation.getArgument(0);
                    List<String> labels = invocation.getArgument(1);
                    String bookingId = invocation.getArgument(2);

                    for (String label : labels) {
                        String key = eventId + ":" + label;
                        if (redisMemory.putIfAbsent(key, bookingId) != null) {
                            throw new ApiException(ErrorCode.SEAT_UNAVAILABLE, "Seat " + label + " is currently held");
                        }
                    }
                    return labels;
                });

        Mockito.doAnswer(invocation -> {
            String eventId = invocation.getArgument(0);
            List<String> labels = invocation.getArgument(1);
            String bookingId = invocation.getArgument(2);

            if (labels != null) {
                for (String label : labels) {
                    String key = eventId + ":" + label;
                    redisMemory.remove(key, bookingId);
                }
            }
            return null;
        }).when(redisHoldService).releaseHolds(anyString(), any(), anyString());

        // Seed Event Inventory
        EventInventory inventory = new EventInventory(
                EVENT_ID,
                "org-1",
                "Concurrency Grand Concert",
                Instant.now().plusSeconds(86400),
                EventStatus.OPEN,
                Instant.now()
        );
        eventInventoryRepository.save(inventory);

        // Seed Seats
        Seat seat1 = new Seat(EVENT_ID, "tier-1", "A-1", 149900L, "INR");
        Seat seat2 = new Seat(EVENT_ID, "tier-1", "A-2", 149900L, "INR");
        Seat seat3 = new Seat(EVENT_ID, "tier-1", "A-3", 149900L, "INR");
        seatRepository.saveAll(List.of(seat1, seat2, seat3));
    }

    @Test
    @DisplayName("50 concurrent hold requests for the same seat: exactly one succeeds and 49 fail with SEAT_UNAVAILABLE")
    void testFiftyConcurrentHoldRequestsForSameSeat() throws InterruptedException {
        int threadCount = 50;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger seatUnavailableCount = new AtomicInteger(0);
        List<String> successfulBookingIds = new CopyOnWriteArrayList<>();

        CreateBookingRequest request = new CreateBookingRequest(
                EVENT_ID,
                List.of(new SeatSelectionDto("tier-1", "A-1"))
        );

        for (int i = 0; i < threadCount; i++) {
            final String userId = "user-" + i;
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await(); // Simultaneous thunderclap
                    BookingResponseDto response = bookingService.createHold(userId, request, null);
                    successCount.incrementAndGet();
                    successfulBookingIds.add(response.bookingId());
                } catch (ApiException e) {
                    if (e.getErrorCode() == ErrorCode.SEAT_UNAVAILABLE) {
                        seatUnavailableCount.incrementAndGet();
                    }
                } catch (Exception ignored) {
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        readyLatch.await();
        startLatch.countDown(); // Launch all threads at the exact same moment
        assertTrue(doneLatch.await(10, TimeUnit.SECONDS), "Timed out waiting for concurrent holds");
        executor.shutdown();

        // Assert guarantee: EXACTLY 1 succeeds, EXACTLY 49 fail with SEAT_UNAVAILABLE
        assertEquals(1, successCount.get(), "Expected exactly 1 thread to acquire the seat hold");
        assertEquals(49, seatUnavailableCount.get(), "Expected 49 threads to receive SEAT_UNAVAILABLE");

        // Verify database state: Seat A-1 is marked HELD
        Seat seatInDb = seatRepository.findByEventIdAndTierIdAndSeatLabel(EVENT_ID, "tier-1", "A-1").orElseThrow();
        assertEquals(SeatStatus.HELD, seatInDb.getStatus());
        assertEquals(successfulBookingIds.getFirst(), seatInDb.getHeldByBookingId());
    }

    @Test
    @DisplayName("Expired holds become bookable again")
    void testExpiredHoldsBecomeBookableAgain() {
        CreateBookingRequest request = new CreateBookingRequest(
                EVENT_ID,
                List.of(new SeatSelectionDto("tier-1", "A-2"))
        );

        // 1. Initial user holds seat
        BookingResponseDto firstBooking = bookingService.createHold("user-early", request, null);
        assertNotNull(firstBooking);
        assertEquals("HELD", firstBooking.status());

        // 2. Another user tries immediately: fails with SEAT_UNAVAILABLE
        assertThrows(ApiException.class, () -> bookingService.createHold("user-late", request, null));

        // 3. Fast-forward expiration in DB
        Booking bookingInDb = bookingRepository.findById(firstBooking.bookingId()).orElseThrow();
        bookingInDb.setHoldExpiresAt(Instant.now().minusSeconds(10));
        bookingRepository.save(bookingInDb);

        // Run scheduler to expire hold
        holdExpiryScheduler.processExpiredHolds();

        // 4. Now the second user tries again: MUST SUCCEED!
        BookingResponseDto secondBooking = bookingService.createHold("user-late", request, null);
        assertNotNull(secondBooking);
        assertEquals("HELD", secondBooking.status());
        assertNotEquals(firstBooking.bookingId(), secondBooking.bookingId());
    }

    @Test
    @DisplayName("Overlapping multi-seat requests never deadlock because seats are sorted before update")
    void testOverlappingMultiSeatRequestsNeverDeadlock() throws InterruptedException {
        int concurrency = 20;
        ExecutorService executor = Executors.newFixedThreadPool(concurrency);
        CountDownLatch readyLatch = new CountDownLatch(concurrency);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(concurrency);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger conflictCount = new AtomicInteger(0);

        // Request 1: seats [A-2, A-3]
        CreateBookingRequest reqA = new CreateBookingRequest(EVENT_ID, List.of(
                new SeatSelectionDto("tier-1", "A-2"),
                new SeatSelectionDto("tier-1", "A-3")
        ));

        // Request 2: seats in reverse order [A-3, A-2]
        CreateBookingRequest reqB = new CreateBookingRequest(EVENT_ID, List.of(
                new SeatSelectionDto("tier-1", "A-3"),
                new SeatSelectionDto("tier-1", "A-2")
        ));

        for (int i = 0; i < concurrency; i++) {
            final int index = i;
            final String userId = "user-pair-" + i;
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    CreateBookingRequest chosen = (index % 2 == 0) ? reqA : reqB;
                    bookingService.createHold(userId, chosen, null);
                    successCount.incrementAndGet();
                } catch (ApiException e) {
                    if (e.getErrorCode() == ErrorCode.SEAT_UNAVAILABLE) {
                        conflictCount.incrementAndGet();
                    }
                } catch (Exception ignored) {
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        readyLatch.await();
        startLatch.countDown();
        // If deadlock occurred, threads would hang and fail timeout
        boolean finishedInTime = doneLatch.await(5, TimeUnit.SECONDS);
        executor.shutdown();

        assertTrue(finishedInTime, "Deadlock detected! Overlapping threads failed to complete within timeout");
        assertEquals(1, successCount.get(), "Expected exactly 1 pair request to acquire both seats");
        assertEquals(concurrency - 1, conflictCount.get(), "All other overlapping requests should cleanly fail without deadlocking");
    }
}
