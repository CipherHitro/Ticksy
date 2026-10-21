package com.ticksy.booking.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "event_inventory")
public class EventInventory {

    @Id
    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Column(name = "organizer_id", length = 36, nullable = false)
    private String organizerId;

    @Column(name = "title", length = 255, nullable = false)
    private String title;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private EventStatus status = EventStatus.OPEN;

    @Column(name = "initialized_at", nullable = false)
    private Instant initializedAt;

    public EventInventory() {}

    public EventInventory(String eventId, String organizerId, String title, Instant startsAt, EventStatus status, Instant initializedAt) {
        this.eventId = eventId;
        this.organizerId = organizerId;
        this.title = title;
        this.startsAt = startsAt;
        this.status = status;
        this.initializedAt = initializedAt;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getOrganizerId() {
        return organizerId;
    }

    public void setOrganizerId(String organizerId) {
        this.organizerId = organizerId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public void setStartsAt(Instant startsAt) {
        this.startsAt = startsAt;
    }

    public EventStatus getStatus() {
        return status;
    }

    public void setStatus(EventStatus status) {
        this.status = status;
    }

    public Instant getInitializedAt() {
        return initializedAt;
    }

    public void setInitializedAt(Instant initializedAt) {
        this.initializedAt = initializedAt;
    }
}
