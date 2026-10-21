package com.ticksy.booking.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "seats", uniqueConstraints = {
    @UniqueConstraint(name = "uq_seat", columnNames = {"event_id", "tier_id", "seat_label"})
}, indexes = {
    @Index(name = "idx_event_status", columnList = "event_id, status")
})
public class Seat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Column(name = "tier_id", length = 36, nullable = false)
    private String tierId;

    @Column(name = "seat_label", length = 20, nullable = false)
    private String seatLabel;

    @Column(name = "price_minor", nullable = false)
    private Long priceMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private SeatStatus status = SeatStatus.AVAILABLE;

    @Column(name = "held_by_booking_id", length = 36)
    private String heldByBookingId;

    @Column(name = "held_until")
    private Instant heldUntil;

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;

    public Seat() {}

    public Seat(String eventId, String tierId, String seatLabel, Long priceMinor, String currency) {
        this.eventId = eventId;
        this.tierId = tierId;
        this.seatLabel = seatLabel;
        this.priceMinor = priceMinor;
        this.currency = currency;
        this.status = SeatStatus.AVAILABLE;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getTierId() {
        return tierId;
    }

    public void setTierId(String tierId) {
        this.tierId = tierId;
    }

    public String getSeatLabel() {
        return seatLabel;
    }

    public void setSeatLabel(String seatLabel) {
        this.seatLabel = seatLabel;
    }

    public Long getPriceMinor() {
        return priceMinor;
    }

    public void setPriceMinor(Long priceMinor) {
        this.priceMinor = priceMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public SeatStatus getStatus() {
        return status;
    }

    public void setStatus(SeatStatus status) {
        this.status = status;
    }

    public String getHeldByBookingId() {
        return heldByBookingId;
    }

    public void setHeldByBookingId(String heldByBookingId) {
        this.heldByBookingId = heldByBookingId;
    }

    public Instant getHeldUntil() {
        return heldUntil;
    }

    public void setHeldUntil(Instant heldUntil) {
        this.heldUntil = heldUntil;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }
}
