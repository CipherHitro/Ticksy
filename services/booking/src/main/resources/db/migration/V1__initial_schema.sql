CREATE TABLE event_inventory (
  event_id CHAR(36) PRIMARY KEY,
  organizer_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  status ENUM('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  initialized_at DATETIME(3) NOT NULL
);

CREATE TABLE seats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  tier_id CHAR(36) NOT NULL,
  seat_label VARCHAR(20) NOT NULL,
  price_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('AVAILABLE','HELD','SOLD') NOT NULL DEFAULT 'AVAILABLE',
  held_by_booking_id CHAR(36) NULL,
  held_until DATETIME(3) NULL,
  version BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_seat (event_id, tier_id, seat_label),
  KEY idx_event_status (event_id, status)
);

CREATE TABLE bookings (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  status ENUM('HELD','PAYMENT_PENDING','CONFIRMED','EXPIRED','CANCELLED','FAILED') NOT NULL,
  total_amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  hold_expires_at DATETIME(3) NOT NULL,
  payment_id CHAR(36) NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_idem (user_id, idempotency_key)
);

CREATE TABLE booking_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  seat_id BIGINT NOT NULL,
  tier_id CHAR(36) NOT NULL,
  seat_label VARCHAR(20) NOT NULL,
  price_minor BIGINT NOT NULL
);

CREATE TABLE outbox_events (
  id CHAR(36) PRIMARY KEY,
  aggregatetype VARCHAR(50) NOT NULL,
  aggregateid CHAR(36) NOT NULL,
  type VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  created_at DATETIME(3) NOT NULL
);

CREATE TABLE processed_events (
  event_id CHAR(36) PRIMARY KEY,
  processed_at DATETIME(3) NOT NULL
);
