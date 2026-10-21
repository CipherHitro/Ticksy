<?php

declare(strict_types=1);

namespace App\Domain\Notification;

use App\Http\Exceptions\ApiException;

class StateMachine
{
    /**
     * @var array<string, list<string>>
     */
    private const ALLOWED_TRANSITIONS = [
        Status::QUEUED->value => [
            Status::SENDING->value,
            Status::SKIPPED->value,
            Status::FAILED->value,
        ],
        Status::SENDING->value => [
            Status::SENT->value,
            Status::QUEUED->value, // retry scheduled
            Status::FAILED->value,
        ],
        Status::SENT->value => [
            Status::DELIVERED->value,
            Status::DELAYED->value,
            Status::BOUNCED->value,
            Status::COMPLAINED->value,
            Status::FAILED->value,
        ],
        Status::DELAYED->value => [
            Status::DELIVERED->value,
            Status::BOUNCED->value,
            Status::FAILED->value,
        ],
        Status::DELIVERED->value => [
            Status::COMPLAINED->value,
        ],
        Status::FAILED->value => [
            Status::QUEUED->value, // admin retry only
        ],
        Status::BOUNCED->value => [],
        Status::COMPLAINED->value => [],
        Status::SKIPPED->value => [],
    ];

    /**
     * Evaluates a status transition.
     *
     * @param  Status  $current  Current notification status
     * @param  Status  $target  Desired target status
     * @param  bool  $isWebhook  Whether the update originated from a webhook event
     * @return Status The new status (either $target, or $current if backward webhook move ignored)
     *
     * @throws ApiException If the transition is illegal
     */
    public static function transition(Status $current, Status $target, bool $isWebhook = false): Status
    {
        // No-op transition
        if ($current === $target) {
            return $current;
        }

        // Terminal states cannot transition to anything
        if ($current->isTerminal()) {
            if ($isWebhook) {
                // Ignore webhook trying to update terminal state
                return $current;
            }
            throw ApiException::conflict("Cannot transition from terminal status '{$current->value}' to '{$target->value}'", 'INVALID_STATE');
        }

        // Check explicit transition table
        $allowed = self::ALLOWED_TRANSITIONS[$current->value];
        if (in_array($target->value, $allowed, true)) {
            return $target;
        }

        // Webhook out-of-order handling
        if ($isWebhook) {
            // Forward jump: target has higher rank than current (e.g. QUEUED -> DELIVERED)
            if ($target->rank() > $current->rank()) {
                return $target;
            }

            // Backward move: target has lower or equal rank (e.g. SENT arriving after DELIVERED)
            // Silently ignore per §5: "A transition request that would move backwards is ignored"
            return $current;
        }

        throw ApiException::conflict("Illegal state transition from '{$current->value}' to '{$target->value}'", 'INVALID_STATE');
    }

    public static function canTransition(Status $current, Status $target, bool $isWebhook = false): bool
    {
        try {
            $result = self::transition($current, $target, $isWebhook);

            return $result === $target;
        } catch (\Throwable) {
            return false;
        }
    }
}
