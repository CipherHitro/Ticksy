<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Application\EventRouter;
use App\Domain\Event\EventEnvelope;
use App\Domain\Notification\TemplateRegistry;
use App\Http\Exceptions\ApiException;
use App\Infrastructure\Redis\ContactDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class DevController extends Controller
{
    public function __construct()
    {
        // Enforce APP_ENV=local or testing only
        if (! app()->environment(['local', 'testing'])) {
            throw ApiException::notFound('Endpoint not available outside local development');
        }
    }

    public function injectEvent(Request $request, EventRouter $router, \App\Application\EmailWorker $worker): JsonResponse
    {
        $envelope = EventEnvelope::fromArray($request->all());
        $record = $router->handle($envelope);

        if ($record !== null) {
            try {
                $worker->processNotification($record->id, 1, $envelope->requestId);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Immediate email delivery attempt failed: {$e->getMessage()}");
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'handled' => $record !== null,
                'record' => $record?->toApiArray(true),
            ],
        ]);
    }

    public function seedContact(Request $request, ContactDirectory $directory): JsonResponse
    {
        $userId = (string) $request->input('userId');
        $email = (string) $request->input('email');
        $name = (string) $request->input('name', 'Dev User');
        $role = (string) $request->input('role', 'ATTENDEE');

        if (empty($userId) || empty($email)) {
            throw ApiException::validation('userId and email are required');
        }

        $directory->upsert($userId, $email, $name, $role);

        return response()->json([
            'success' => true,
            'data' => [
                'userId' => $userId,
                'email' => $email,
                'name' => $name,
                'role' => $role,
            ],
        ]);
    }

    public function previewTemplate(Request $request, string $template): Response
    {
        $samplePayload = match ($template) {
            'welcome' => [
                'userId' => 'dev-user-1',
                'email' => 'dev@ticksy.local',
                'name' => 'Alex Developer',
                'role' => 'ATTENDEE',
                'registeredAt' => now()->toIso8601ZuluString(),
            ],
            'booking-confirmation' => [
                'bookingId' => 'bkg-dev-123',
                'userId' => 'dev-user-1',
                'eventId' => 'evt-dev-456',
                'eventTitle' => 'Rock Festival 2026',
                'totalAmountMinor' => 250000,
                'currency' => 'INR',
                'confirmedAt' => now()->toIso8601ZuluString(),
                'eventStartsAt' => now()->addDays(10)->toIso8601ZuluString(),
                'venueName' => 'City Stadium',
                'venueCity' => 'Bengaluru',
                'items' => [
                    ['seatLabel' => 'VIP-1', 'tierName' => 'VIP', 'priceMinor' => 250000],
                ],
            ],
            'refund-confirmation' => [
                'bookingId' => 'bkg-dev-123',
                'userId' => 'dev-user-1',
                'eventTitle' => 'Rock Festival 2026',
                'refundAmountMinor' => 250000,
                'currency' => 'INR',
                'refundedAt' => now()->toIso8601ZuluString(),
            ],
            'payout-completed' => [
                'organizerId' => 'org-dev-999',
                'payoutId' => 'po-dev-001',
                'amountMinor' => 15000000,
                'currency' => 'INR',
                'completedAt' => now()->toIso8601ZuluString(),
            ],
            'payout-failed' => [
                'organizerId' => 'org-dev-999',
                'payoutId' => 'po-dev-002',
                'amountMinor' => 15000000,
                'currency' => 'INR',
                'failedAt' => now()->toIso8601ZuluString(),
            ],
            'payment-failed' => [
                'paymentId' => 'pay-dev-333',
                'bookingId' => 'bkg-dev-123',
                'userId' => 'dev-user-1',
                'eventTitle' => 'Rock Festival 2026',
                'amountMinor' => 250000,
                'currency' => 'INR',
                'failedAt' => now()->toIso8601ZuluString(),
            ],
            default => throw ApiException::notFound("Template '{$template}' not found"),
        };

        $rendered = TemplateRegistry::render($template, $samplePayload);

        return response($rendered['html'])->header('Content-Type', 'text/html');
    }
}
