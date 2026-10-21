package com.ticksy.booking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticksy.booking.client.CatalogEventDto;
import com.ticksy.booking.client.CatalogGrpcClient;
import com.ticksy.booking.domain.*;
import com.ticksy.booking.dto.BookingResponseDto;
import com.ticksy.booking.dto.CreateBookingRequest;
import com.ticksy.booking.dto.SeatMapResponseDto;
import com.ticksy.booking.dto.SeatSelectionDto;
import com.ticksy.booking.exception.ApiException;
import com.ticksy.booking.exception.ErrorCode;
import com.ticksy.booking.repository.*;
import com.ticksy.booking.service.BookingService;
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
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;

@SpringBootTest
@ActiveProfiles("test")
public class BookingServiceTest {

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

    @BeforeEach
    void setUp() {
        bookingItemRepository.deleteAll();
        bookingRepository.deleteAll();
        seatRepository.deleteAll();
        eventInventoryRepository.deleteAll();
        outboxEventRepository.deleteAll();

        Mockito.when(redisHoldService.tryAcquireRedisHolds(anyString(), any(), anyString()))
                .thenAnswer(inv -> inv.getArgument(1));
    }

    @Test
    @DisplayName("Lazy inventory initialization: calls Catalog gRPC on first seat map view and seeds inventory")
    void testLazyInventoryInitFromCatalog() {
        String eventId = "evt-lazy-init";

        Mockito.when(catalogGrpcClient.getEventForBooking(eventId))
                .thenReturn(new CatalogEventDto(
                        eventId,
                        "org-mumbai",
                        "Lazy Loaded Festival",
                        Instant.now().plusSeconds(86400),
                        "OPEN",
                        List.of(
                                new CatalogEventDto.CatalogTierDto("tier-gold", "Gold", 10, 199900L, "INR", "G"),
                                new CatalogEventDto.CatalogTierDto("tier-silver", "Silver", 20, 99900L, "INR", "S")
                        )
                ));

        SeatMapResponseDto seatMap = bookingService.getSeatMap(eventId);

        assertNotNull(seatMap);
        assertEquals(eventId, seatMap.eventId());
        assertEquals("Lazy Loaded Festival", seatMap.title());
        assertEquals(2, seatMap.tiers().size());

        // Verify database persistence
        assertTrue(eventInventoryRepository.existsById(eventId));
        assertEquals(30, seatRepository.findByEventId(eventId).size());
    }

    @Test
    @DisplayName("Stopping Catalog triggers circuit breaker fallback: cached events still serve, unknown event throws UPSTREAM_UNAVAILABLE")
    void testStoppingCatalogServesCachedEventsAndThrowsUpstreamUnavailableForNew() {
        String cachedEventId = "evt-cached";

        // Seed cached event in DB
        EventInventory cachedInventory = new EventInventory(
                cachedEventId,
                "org-1",
                "Cached Event in DB",
                Instant.now().plusSeconds(86400),
                EventStatus.OPEN,
                Instant.now()
        );
        eventInventoryRepository.save(cachedInventory);
        seatRepository.save(new Seat(cachedEventId, "tier-1", "A-1", 100000L, "INR"));

        // Simulate Catalog down
        Mockito.when(catalogGrpcClient.getEventForBooking(anyString()))
                .thenThrow(new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE, "Catalog upstream unavailable"));

        // 1. Cached event STILL SERVES flawlessly even though Catalog is down!
        SeatMapResponseDto cachedMap = bookingService.getSeatMap(cachedEventId);
        assertNotNull(cachedMap);
        assertEquals("Cached Event in DB", cachedMap.title());

        // 2. Uncached event with Catalog down throws UPSTREAM_UNAVAILABLE (503)
        ApiException ex = assertThrows(ApiException.class, () -> bookingService.getSeatMap("evt-unknown"));
        assertEquals(ErrorCode.UPSTREAM_UNAVAILABLE, ex.getErrorCode());
    }

    @Test
    @DisplayName("Maximum seats per booking enforced: requesting > 6 seats fails with TOO_MANY_SEATS (400)")
    void testTooManySeatsPerBookingFails() {
        List<SeatSelectionDto> sevenSeats = List.of(
                new SeatSelectionDto("tier-1", "A-1"),
                new SeatSelectionDto("tier-1", "A-2"),
                new SeatSelectionDto("tier-1", "A-3"),
                new SeatSelectionDto("tier-1", "A-4"),
                new SeatSelectionDto("tier-1", "A-5"),
                new SeatSelectionDto("tier-1", "A-6"),
                new SeatSelectionDto("tier-1", "A-7")
        );

        CreateBookingRequest req = new CreateBookingRequest("evt-any", sevenSeats);

        ApiException ex = assertThrows(ApiException.class, () -> bookingService.createHold("user-1", req, null));
        assertEquals(ErrorCode.TOO_MANY_SEATS, ex.getErrorCode());
    }

    @Test
    @DisplayName("Booking lifecycle: Hold -> Cancel releases seats; Hold -> Confirm marks seats SOLD and saves outbox event")
    void testBookingLifecycleAndOutboxEvents() {
        String eventId = "evt-lifecycle";
        EventInventory inv = new EventInventory(eventId, "org-1", "LifeCycle Show", Instant.now().plusSeconds(86400), EventStatus.OPEN, Instant.now());
        eventInventoryRepository.save(inv);
        seatRepository.save(new Seat(eventId, "tier-1", "A-1", 200000L, "INR"));

        CreateBookingRequest req = new CreateBookingRequest(eventId, List.of(new SeatSelectionDto("tier-1", "A-1")));

        // 1. Create Hold
        BookingResponseDto booking = bookingService.createHold("user-life", req, null);
        assertEquals("HELD", booking.status());

        // 2. Dev confirm
        BookingResponseDto confirmed = bookingService.confirmDevBooking(booking.bookingId(), "user-life");
        assertEquals("CONFIRMED", confirmed.status());
        assertNotNull(confirmed.paymentId());

        Seat seat = seatRepository.findByEventIdAndTierIdAndSeatLabel(eventId, "tier-1", "A-1").orElseThrow();
        assertEquals(SeatStatus.SOLD, seat.getStatus());

        // Verify Outbox Event created
        List<OutboxEvent> outboxList = outboxEventRepository.findAll();
        assertEquals(1, outboxList.size());
        assertEquals("BookingConfirmed", outboxList.getFirst().getType());
        assertEquals(booking.bookingId(), outboxList.getFirst().getAggregateId());
    }

    @Test
    @DisplayName("Idempotency: duplicate request with same user and idempotencyKey returns original booking without creating new one")
    void testIdempotentBookingCreation() {
        String eventId = "evt-idemp";
        EventInventory inv = new EventInventory(eventId, "org-1", "Idemp Show", Instant.now().plusSeconds(86400), EventStatus.OPEN, Instant.now());
        eventInventoryRepository.save(inv);
        seatRepository.save(new Seat(eventId, "tier-1", "A-1", 200000L, "INR"));

        CreateBookingRequest req = new CreateBookingRequest(eventId, List.of(new SeatSelectionDto("tier-1", "A-1")));
        String key = "idem-key-12345";

        BookingResponseDto first = bookingService.createHold("user-idemp", req, key);
        BookingResponseDto second = bookingService.createHold("user-idemp", req, key);

        assertEquals(first.bookingId(), second.bookingId());
        assertEquals(1, bookingRepository.count());
    }
}
