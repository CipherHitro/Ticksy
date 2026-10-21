<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Notification\StateMachine;
use App\Domain\Notification\Status;
use App\Http\Exceptions\ApiException;
use PHPUnit\Framework\TestCase;

class StateMachineTest extends TestCase
{
    /**
     * U-02: Every allowed transition in the specification table works.
     */
    public function test_u02_allowed_transitions_succeed(): void
    {
        // QUEUED transitions
        $this->assertEquals(Status::SENDING, StateMachine::transition(Status::QUEUED, Status::SENDING));
        $this->assertEquals(Status::SKIPPED, StateMachine::transition(Status::QUEUED, Status::SKIPPED));
        $this->assertEquals(Status::FAILED, StateMachine::transition(Status::QUEUED, Status::FAILED));

        // SENDING transitions
        $this->assertEquals(Status::SENT, StateMachine::transition(Status::SENDING, Status::SENT));
        $this->assertEquals(Status::QUEUED, StateMachine::transition(Status::SENDING, Status::QUEUED));
        $this->assertEquals(Status::FAILED, StateMachine::transition(Status::SENDING, Status::FAILED));

        // SENT transitions
        $this->assertEquals(Status::DELIVERED, StateMachine::transition(Status::SENT, Status::DELIVERED));
        $this->assertEquals(Status::DELAYED, StateMachine::transition(Status::SENT, Status::DELAYED));
        $this->assertEquals(Status::BOUNCED, StateMachine::transition(Status::SENT, Status::BOUNCED));
        $this->assertEquals(Status::COMPLAINED, StateMachine::transition(Status::SENT, Status::COMPLAINED));
        $this->assertEquals(Status::FAILED, StateMachine::transition(Status::SENT, Status::FAILED));

        // DELAYED transitions
        $this->assertEquals(Status::DELIVERED, StateMachine::transition(Status::DELAYED, Status::DELIVERED));
        $this->assertEquals(Status::BOUNCED, StateMachine::transition(Status::DELAYED, Status::BOUNCED));
        $this->assertEquals(Status::FAILED, StateMachine::transition(Status::DELAYED, Status::FAILED));

        // DELIVERED transitions
        $this->assertEquals(Status::COMPLAINED, StateMachine::transition(Status::DELIVERED, Status::COMPLAINED));

        // FAILED transitions (admin retry only)
        $this->assertEquals(Status::QUEUED, StateMachine::transition(Status::FAILED, Status::QUEUED));
    }

    /**
     * U-02: Disallowed transitions throw ApiException (409 CONFLICT, code INVALID_STATE).
     */
    public function test_u02_disallowed_transitions_throw_exception(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionCode(409);

        // DELIVERED cannot transition back to QUEUED
        StateMachine::transition(Status::DELIVERED, Status::QUEUED);
    }

    public function test_u02_terminal_states_cannot_transition(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionCode(409);

        // BOUNCED is terminal
        StateMachine::transition(Status::BOUNCED, Status::SENDING);
    }

    /**
     * U-02: Webhook forward jump accepted (QUEUED -> DELIVERED).
     */
    public function test_u02_webhook_forward_leap_accepted(): void
    {
        // When worker crashed after provider accepted, webhook brings DELIVERED directly
        $resolved = StateMachine::transition(Status::QUEUED, Status::DELIVERED, isWebhook: true);
        $this->assertEquals(Status::DELIVERED, $resolved);

        $resolved = StateMachine::transition(Status::SENDING, Status::DELIVERED, isWebhook: true);
        $this->assertEquals(Status::DELIVERED, $resolved);
    }

    /**
     * U-02: Webhook backward transitions are silently ignored (retains current status).
     */
    public function test_u02_webhook_backward_transitions_ignored(): void
    {
        // DELIVERED already recorded, late arriving webhook email.sent arrives
        $resolved = StateMachine::transition(Status::DELIVERED, Status::SENT, isWebhook: true);
        $this->assertEquals(Status::DELIVERED, $resolved);

        // COMPLAINED already recorded, DELIVERED webhook arrives
        $resolved = StateMachine::transition(Status::COMPLAINED, Status::DELIVERED, isWebhook: true);
        $this->assertEquals(Status::COMPLAINED, $resolved);
    }
}
