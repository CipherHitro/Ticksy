package com.ticksy.booking.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Id
    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    public ProcessedEvent() {}

    public ProcessedEvent(String eventId, Instant processedAt) {
        this.eventId = eventId;
        this.processedAt = processedAt;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(Instant processedAt) {
        this.processedAt = processedAt;
    }
}
