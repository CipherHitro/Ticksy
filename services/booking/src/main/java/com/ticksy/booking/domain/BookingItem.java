package com.ticksy.booking.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "booking_items")
public class BookingItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_id", length = 36, nullable = false)
    private String bookingId;

    @Column(name = "seat_id", nullable = false)
    private Long seatId;

    @Column(name = "tier_id", length = 36, nullable = false)
    private String tierId;

    @Column(name = "seat_label", length = 20, nullable = false)
    private String seatLabel;

    @Column(name = "price_minor", nullable = false)
    private Long priceMinor;

    public BookingItem() {}

    public BookingItem(String bookingId, Long seatId, String tierId, String seatLabel, Long priceMinor) {
        this.bookingId = bookingId;
        this.seatId = seatId;
        this.tierId = tierId;
        this.seatLabel = seatLabel;
        this.priceMinor = priceMinor;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getBookingId() {
        return bookingId;
    }

    public void setBookingId(String bookingId) {
        this.bookingId = bookingId;
    }

    public Long getSeatId() {
        return seatId;
    }

    public void setSeatId(Long seatId) {
        this.seatId = seatId;
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
}
