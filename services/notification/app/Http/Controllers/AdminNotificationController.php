<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Http\Exceptions\ApiException;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\SuppressionList;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AdminNotificationController extends Controller
{
    public function list(Request $request, NotificationRepository $repo): JsonResponse
    {
        $page = $this->validatePage($request);
        $limit = $this->validateLimit($request);
        $status = $this->validateStatus($request);
        $template = $request->query('template') ? (string) $request->query('template') : null;
        $userId = $request->query('userId') ? (string) $request->query('userId') : null;
        $from = $request->query('from') ? (string) $request->query('from') : null;
        $to = $request->query('to') ? (string) $request->query('to') : null;

        if ($from !== null && strtotime($from) === false) {
            throw ApiException::validation('Invalid "from" timestamp', [
                ['field' => 'from', 'message' => 'must be a valid ISO-8601 timestamp'],
            ]);
        }

        if ($to !== null && strtotime($to) === false) {
            throw ApiException::validation('Invalid "to" timestamp', [
                ['field' => 'to', 'message' => 'must be a valid ISO-8601 timestamp'],
            ]);
        }

        $result = $repo->listAll($status, $template, $userId, $from, $to, $page, $limit);

        return response()->json([
            'success' => true,
            'data' => array_map(fn (NotificationRecord $r) => $r->toApiArray(true), $result['data']),
            'meta' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $result['total'],
            ],
        ]);
    }

    public function show(string $id, NotificationRepository $repo): JsonResponse
    {
        $record = $repo->find($id);
        if ($record === null) {
            throw ApiException::notFound("Notification '{$id}' not found", 'NOTIFICATION_NOT_FOUND');
        }

        return response()->json([
            'success' => true,
            'data' => $record->toApiArray(true),
        ]);
    }

    public function retry(string $id, NotificationRepository $repo, Publisher $publisher): JsonResponse
    {
        $record = $repo->find($id);
        if ($record === null) {
            throw ApiException::notFound("Notification '{$id}' not found", 'NOTIFICATION_NOT_FOUND');
        }

        if ($record->status !== Status::FAILED) {
            throw ApiException::conflict(
                "Only FAILED notifications can be retried (current status: {$record->status->value})",
                'INVALID_STATE'
            );
        }

        $updated = $repo->updateStatus($id, Status::QUEUED, [
            'failureCode' => '',
            'failureMessage' => '',
        ]);

        $publisher->publish($id, 1);

        return response()->json([
            'success' => true,
            'data' => $updated->toApiArray(true),
        ]);
    }

    public function stats(NotificationRepository $repo): JsonResponse
    {
        $stats = $repo->getStats();

        return response()->json([
            'success' => true,
            'data' => $stats,
        ]);
    }

    public function listSuppressions(Request $request, SuppressionList $suppressions): JsonResponse
    {
        $page = $this->validatePage($request);
        $limit = $this->validateLimit($request);

        $result = $suppressions->list($page, $limit);

        return response()->json([
            'success' => true,
            'data' => $result['data'],
            'meta' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $result['total'],
            ],
        ]);
    }

    public function deleteSuppression(string $hash, SuppressionList $suppressions): Response
    {
        $removed = $suppressions->remove($hash);
        if (! $removed) {
            throw ApiException::notFound("Suppression record '{$hash}' not found", 'SUPPRESSION_NOT_FOUND');
        }

        return response()->noContent();
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
