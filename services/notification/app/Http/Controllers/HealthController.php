<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class HealthController extends Controller
{
    public function live(Request $request): JsonResponse
    {
        return response()->json([
            'status' => 'UP',
            'service' => 'notification',
            'timestamp' => now()->toIso8601ZuluString(),
        ]);
    }

    public function ready(Request $request): JsonResponse
    {
        $redisHost = (string) config('notification.redis.host', '127.0.0.1');
        $redisPort = (int) config('notification.redis.port', 6379);

        $rabbitHost = (string) config('notification.rabbitmq.host', '127.0.0.1');
        $rabbitPort = (int) config('notification.rabbitmq.port', 5672);

        $checks = [
            'redis' => $this->checkSocket($redisHost, $redisPort),
            'rabbitmq' => $this->checkSocket($rabbitHost, $rabbitPort),
        ];

        $isReady = $checks['redis'] === 'UP' && $checks['rabbitmq'] === 'UP';

        $statusCode = $isReady ? Response::HTTP_OK : Response::HTTP_SERVICE_UNAVAILABLE;

        return response()->json([
            'status' => $isReady ? 'UP' : 'DOWN',
            'service' => 'notification',
            'checks' => $checks,
            'timestamp' => now()->toIso8601ZuluString(),
        ], $statusCode);
    }

    private function checkSocket(string $host, int $port, float $timeout = 1.0): string
    {
        $fp = @fsockopen($host, $port, $errno, $errstr, $timeout);
        if ($fp) {
            fclose($fp);

            return 'UP';
        }

        return 'DOWN';
    }
}
