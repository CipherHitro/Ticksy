<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Infrastructure\Rabbit\RetryLadder;
use PHPUnit\Framework\TestCase;

class RetryLadderTest extends TestCase
{
    /**
     * U-10: Retry ladder: attempt -> queue mapping 30s, 2m, 10m, 1h, 6h, then FAILED
     */
    public function test_u10_retry_ladder_mapping_and_exhaustion(): void
    {
        $this->assertEquals('email.retry.30s', RetryLadder::getRoutingKeyForAttempt(1));
        $this->assertEquals(30000, RetryLadder::getTtlMsForAttempt(1));
        $this->assertFalse(RetryLadder::isExhausted(1));

        $this->assertEquals('email.retry.2m', RetryLadder::getRoutingKeyForAttempt(2));
        $this->assertEquals(120000, RetryLadder::getTtlMsForAttempt(2));
        $this->assertFalse(RetryLadder::isExhausted(2));

        $this->assertEquals('email.retry.10m', RetryLadder::getRoutingKeyForAttempt(3));
        $this->assertEquals(600000, RetryLadder::getTtlMsForAttempt(3));
        $this->assertFalse(RetryLadder::isExhausted(3));

        $this->assertEquals('email.retry.1h', RetryLadder::getRoutingKeyForAttempt(4));
        $this->assertEquals(3600000, RetryLadder::getTtlMsForAttempt(4));
        $this->assertFalse(RetryLadder::isExhausted(4));

        $this->assertEquals('email.retry.6h', RetryLadder::getRoutingKeyForAttempt(5));
        $this->assertEquals(21600000, RetryLadder::getTtlMsForAttempt(5));
        $this->assertFalse(RetryLadder::isExhausted(5));

        // Attempt 6 (exhausted)
        $this->assertNull(RetryLadder::getRoutingKeyForAttempt(6));
        $this->assertTrue(RetryLadder::isExhausted(6));
    }
}
