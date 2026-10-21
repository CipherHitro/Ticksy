package com.ticksy.booking.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "bookings", uniqueConstraints = {
    @UniqueConstraint(name = "uq_idem", columnNames = {"user_id", "idempotency_key"})
})
public class Booking {

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private BookingStatus status;

    @Column(name = "total_amount_minor", nullable = false)
    private Long totalAmountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency;

    @Column(name = "hold_expires_at", nullable = false)
    private Instant holdExpiresAt;

    @Column(name = "payment_id", length = 36)
    private String paymentId;

    @Column(name = "idempotency_key", length = 64)
    private String idempotencyKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;

    @OneToMany(mappedBy = "bookingId", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<BookingItem> items = new ArrayList<>();

    public Booking() {}

    public Booking(String id, String userId, String eventId, BookingStatus status, Long totalAmountMinor, String currency, Instant holdExpiresAt, String idempotencyKey, Instant now) {
        this.id = id;
        this.userId = userId;
        this.eventId = eventId;
        this.status = status;
        this.totalAmountMinor = totalAmountMinor;
        this.currency = currency;
        this.holdExpiresAt = holdExpiresAt;
        this.idempotencyKey = idempotencyKey;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public BookingStatus getStatus() {
        return status;
    }

    public void setStatus(BookingStatus status) {
        this.status = status;
    }

    public Long getTotalAmountMinor() {
        return totalAmountMinor;
    }

    public void setTotalAmountMinor(Long totalAmountMinor) {
        this.totalAmountMinor = totalAmountMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public Instant getHoldExpiresAt() {
        return holdExpiresAt;
    }

    public void setHoldExpiresAt(Instant holdExpiresAt) {
        this.holdExpiresAt = holdExpiresAt;
    }

    public String getPaymentId() {
        return paymentId;
    }

    public void setPaymentId(String paymentId) {
        this.paymentId = paymentId;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public List<BookingItem> getItems() {
        return items;
    }

    public void setItems(List<BookingItem> items) {
        this.items = items;
    }
}
