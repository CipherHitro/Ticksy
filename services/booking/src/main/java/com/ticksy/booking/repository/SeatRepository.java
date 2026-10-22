package com.ticksy.booking.repository;

import com.ticksy.booking.domain.Seat;
import com.ticksy.booking.domain.SeatStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SeatRepository extends JpaRepository<Seat, Long> {

    List<Seat> findByEventId(String eventId);

    List<Seat> findByEventIdAndTierId(String eventId, String tierId);

    Optional<Seat> findByEventIdAndTierIdAndSeatLabel(String eventId, String tierId, String seatLabel);

    /**
     * The core conditional hold update query required by the Ticksy specification.
     * InnoDB row-level locking ensures race-safe concurrent holds.
     */
    @Modifying
    @Query(value = """
        UPDATE seats
        SET status = 'HELD', held_by_booking_id = :bookingId, held_until = :heldUntil, version = version + 1
        WHERE event_id = :eventId AND tier_id = :tierId AND seat_label = :seatLabel
          AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < :now))
        """, nativeQuery = true)
    int holdSeatConditionally(@Param("bookingId") String bookingId,
                              @Param("heldUntil") Instant heldUntil,
                              @Param("eventId") String eventId,
                              @Param("tierId") String tierId,
                              @Param("seatLabel") String seatLabel,
                              @Param("now") Instant now);

    @Modifying
    @Query(value = """
        UPDATE seats
        SET status = 'AVAILABLE', held_by_booking_id = NULL, held_until = NULL, version = version + 1
        WHERE held_by_booking_id = :bookingId AND (status = 'HELD' OR status = 'SOLD')
        """, nativeQuery = true)
    int releaseSeatsForBooking(@Param("bookingId") String bookingId);

    @Modifying
    @Query(value = """
        UPDATE seats
        SET status = 'SOLD', version = version + 1
        WHERE held_by_booking_id = :bookingId AND status = 'HELD'
        """, nativeQuery = true)
    int markSeatsSoldForBooking(@Param("bookingId") String bookingId);

    @Modifying
    @Query(value = """
        UPDATE seats
        SET status = 'AVAILABLE', held_by_booking_id = NULL, held_until = NULL, version = version + 1
        WHERE status = 'HELD' AND held_until < :now
        """, nativeQuery = true)
    int releaseExpiredSeats(@Param("now") Instant now);

    long countByEventIdAndStatus(String eventId, SeatStatus status);
}
