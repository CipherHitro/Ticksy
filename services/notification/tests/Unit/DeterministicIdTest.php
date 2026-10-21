<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Notification\DeterministicId;
use PHPUnit\Framework\TestCase;

class DeterministicIdTest extends TestCase
{
    public function test_u01_same_event_and_template_produces_identical_uuid(): void
    {
        $eventId = 'b7e28dd8-80f2-4919-8664-839556d78ec5';
        $template = 'booking-confirmation';

        $id1 = DeterministicId::generate($eventId, $template);
        $id2 = DeterministicId::generate($eventId, $template);

        $this->assertEquals($id1, $id2);
        // Valid UUIDv5 regex
        $this->assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            $id1
        );
    }

    public function test_u01_different_template_produces_different_uuid(): void
    {
        $eventId = 'b7e28dd8-80f2-4919-8664-839556d78ec5';

        $id1 = DeterministicId::generate($eventId, 'welcome');
        $id2 = DeterministicId::generate($eventId, 'booking-confirmation');

        $this->assertNotEquals($id1, $id2);
    }

    public function test_u01_different_event_produces_different_uuid(): void
    {
        $template = 'booking-confirmation';

        $id1 = DeterministicId::generate('11111111-1111-1111-1111-111111111111', $template);
        $id2 = DeterministicId::generate('22222222-2222-2222-2222-222222222222', $template);

        $this->assertNotEquals($id1, $id2);
    }
}
