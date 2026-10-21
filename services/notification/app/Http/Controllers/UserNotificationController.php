<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Http\Exceptions\ApiException;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\PreferenceStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserNotificationController extends Controller
{
    public function list(Request $request, NotificationRepository $repo): JsonResponse
    {
        $userId = (string) $request->attributes->get('userId');
        if (empty($userId)) {
            throw ApiException::unauthenticated();
        }

        $page = $this->validatePage($request);
        $limit = $this->validateLimit($request);
        $status = $this->validateStatus($request);
        $template = $request->query('template') ? (string) $request->query('template') : null;

        $result = $repo->listForUser($userId, $status, $template, $page, $limit);

        return response()->json([
            'success' => true,
            'data' => array_map(fn (NotificationRecord $r) => $r->toApiArray(false), $result['data']),
            'meta' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $result['total'],
            ],
        ]);
    }

    public function getPreferences(Request $request, PreferenceStore $store): JsonResponse
    {
        $userId = (string) $request->attributes->get('userId');
        if (empty($userId)) {
            throw ApiException::unauthenticated();
        }

        $prefs = $store->get($userId);

        return response()->json([
            'success' => true,
            'data' => $prefs,
        ]);
    }

    public function updatePreferences(Request $request, PreferenceStore $store): JsonResponse
    {
        $userId = (string) $request->attributes->get('userId');
        if (empty($userId)) {
            throw ApiException::unauthenticated();
        }

        $body = $request->json()->all();
        if (! is_array($body)) {
            throw ApiException::validation('Request body must be a JSON object');
        }

        $allowedKeys = ['emailReminders', 'emailProductUpdates'];
        $unknownKeys = array_diff(array_keys($body), $allowedKeys);
        if (! empty($unknownKeys)) {
            throw ApiException::validation(
                'Unknown fields or attempt to modify disallowed preferences: '.implode(', ', $unknownKeys),
                array_map(fn ($k) => ['field' => $k, 'message' => 'unknown field or immutable preference'], $unknownKeys)
            );
        }

        $updates = [];
        if (array_key_exists('emailReminders', $body)) {
            if (! is_bool($body['emailReminders'])) {
                throw ApiException::validation('emailReminders must be a boolean', [
                    ['field' => 'emailReminders', 'message' => 'must be a boolean'],
                ]);
            }
            $updates['emailReminders'] = $body['emailReminders'];
        }

        if (array_key_exists('emailProductUpdates', $body)) {
            if (! is_bool($body['emailProductUpdates'])) {
                throw ApiException::validation('emailProductUpdates must be a boolean', [
                    ['field' => 'emailProductUpdates', 'message' => 'must be a boolean'],
                ]);
            }
            $updates['emailProductUpdates'] = $body['emailProductUpdates'];
        }

        $store->update($userId, $updates);
        $current = $store->get($userId);

        return response()->json([
            'success' => true,
            'data' => $current,
        ]);
    }

    private function validatePage(Request $request): int
    {
        if ($request->has('page')) {
            $raw = $request->query('page');
            if (! is_numeric($raw) || (int) $raw < 1) {
                throw ApiException::validation('page must be an integer >= 1', [
                    ['field' => 'page', 'message' => 'must be >= 1'],
                ]);
            }

            return (int) $raw;
        }

        return 1;
    }

    private function validateLimit(Request $request): int
    {
        if ($request->has('limit')) {
            $raw = $request->query('limit');
            if (! is_numeric($raw) || (int) $raw < 1 || (int) $raw > 50) {
                throw ApiException::validation('limit must be an integer between 1 and 50', [
                    ['field' => 'limit', 'message' => 'must be between 1 and 50'],
                ]);
            }

            return (int) $raw;
        }

        return 20;
    }

    private function validateStatus(Request $request): ?Status
    {
        if ($request->has('status')) {
            $raw = (string) $request->query('status');
            $status = Status::tryFrom($raw);
            if ($status === null) {
                throw ApiException::validation("Invalid status '{$raw}'", [
                    ['field' => 'status', 'message' => 'unknown status'],
                ]);
            }

            return $status;
        }

        return null;
    }
}
