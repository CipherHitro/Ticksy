<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Application\ResendWebhookHandler;
use App\Infrastructure\Webhooks\SvixSignatureValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    public function handleResend(Request $request, ResendWebhookHandler $handler): JsonResponse
    {
        $rawBody = $request->getContent();
        $svixId = $request->header('svix-id');
        $svixTimestamp = $request->header('svix-timestamp');
        $svixSignature = $request->header('svix-signature');

        // Verify Svix HMAC signature and timestamp
        SvixSignatureValidator::validate($rawBody, $svixId, $svixTimestamp, $svixSignature);

        $payload = json_decode($rawBody, true) ?? [];

        $handler->handle((string) $svixId, (array) $payload);

        return response()->json([
            'success' => true,
        ]);
    }
}
