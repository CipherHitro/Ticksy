package com.ticksy.booking.repository;

import com.ticksy.booking.domain.Booking;
import com.ticksy.booking.domain.BookingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface BookingRepository extends JpaRepository<Booking, String> {

    Optional<Booking> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);

    Page<Booking> findByUserId(String userId, Pageable pageable);

    Page<Booking> findByUserIdAndStatus(String userId, BookingStatus status, Pageable pageable);

    Page<Booking> findByEventId(String eventId, Pageable pageable);

    List<Booking> findByStatusAndHoldExpiresAtBefore(BookingStatus status, Instant now);
}
