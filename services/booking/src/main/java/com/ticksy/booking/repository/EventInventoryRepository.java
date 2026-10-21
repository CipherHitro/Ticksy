package com.ticksy.booking.repository;

import com.ticksy.booking.domain.EventInventory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EventInventoryRepository extends JpaRepository<EventInventory, String> {
}
