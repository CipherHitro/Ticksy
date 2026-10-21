package com.ticksy.booking.service;

import com.ticksy.booking.exception.ApiException;
import com.ticksy.booking.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
public class RedisHoldService {

    private static final Logger log = LoggerFactory.getLogger(RedisHoldService.class);

    private final StringRedisTemplate redisTemplate;
    private final long holdTtlSeconds;

    // Lua script for atomic compare-and-delete (only delete key if value matches our bookingId)
    private static final String COMPARE_AND_DELETE_LUA = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        else
            return 0
        end
        """;

    private final DefaultRedisScript<Long> compareAndDeleteScript;

    public RedisHoldService(
            StringRedisTemplate redisTemplate,
            @Value("${HOLD_TTL_SECONDS:600}") long holdTtlSeconds) {
        this.redisTemplate = redisTemplate;
        this.holdTtlSeconds = holdTtlSeconds;
        this.compareAndDeleteScript = new DefaultRedisScript<>(COMPARE_AND_DELETE_LUA, Long.class);
    }

    private String buildKey(String eventId, String seatLabel) {
        return "hold:" + eventId + ":" + seatLabel;
    }

    /**
     * Tries to acquire fast front-door distributed holds in Redis for all requested seats.
     * If any seat fails, all previously acquired keys for this booking are rolled back.
     */
    public List<String> tryAcquireRedisHolds(String eventId, List<String> seatLabels, String bookingId) {
        List<String> acquiredSeatLabels = new ArrayList<>();
        Duration ttl = Duration.ofSeconds(holdTtlSeconds);

        try {
            for (String seatLabel : seatLabels) {
                String key = buildKey(eventId, seatLabel);
                Boolean success = redisTemplate.opsForValue().setIfAbsent(key, bookingId, ttl);

                if (Boolean.TRUE.equals(success)) {
                    acquiredSeatLabels.add(seatLabel);
                } else {
                    log.warn("Redis hold contention: seat {} for event {} is already held", seatLabel, eventId);
                    // Rollback previously acquired keys
                    releaseHolds(eventId, acquiredSeatLabels, bookingId);
                    throw new ApiException(ErrorCode.SEAT_UNAVAILABLE, "Seat " + seatLabel + " is currently held by another fan");
                }
            }
            return acquiredSeatLabels;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Redis error while acquiring holds (falling back gracefully to MySQL source of truth): {}", e.getMessage());
            // If Redis is temporarily down or unreachable in test environment, allow MySQL to be ultimate source of truth
            return acquiredSeatLabels;
        }
    }

    /**
     * Atomically releases Redis holds only if the value matches bookingId.
     */
    public void releaseHolds(String eventId, List<String> seatLabels, String bookingId) {
        if (seatLabels == null || seatLabels.isEmpty()) return;

        try {
            for (String seatLabel : seatLabels) {
                String key = buildKey(eventId, seatLabel);
                redisTemplate.execute(compareAndDeleteScript, Collections.singletonList(key), bookingId);
            }
        } catch (Exception e) {
            log.warn("Failed to release Redis hold keys: {}", e.getMessage());
        }
    }
}
