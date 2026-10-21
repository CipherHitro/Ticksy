<?php

declare(strict_types=1);

use App\Http\Controllers\AdminNotificationController;
use App\Http\Controllers\DevController;
use App\Http\Controllers\UserNotificationController;
use App\Http\Controllers\WebhookController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Auth test routes (for test verification)
Route::middleware('jwt.auth')->get('/test-auth', function (Request $request) {
    return response()->json([
        'success' => true,
        'data' => [
            'userId' => $request->attributes->get('userId'),
            'role' => $request->attributes->get('userRole'),
        ],
    ]);
});

Route::middleware(['jwt.auth', 'role:ADMIN'])->get('/test-admin', function (Request $request) {
    return response()->json([
        'success' => true,
        'data' => [
            'admin' => true,
            'userId' => $request->attributes->get('userId'),
        ],
    ]);
});

// User routes (any authenticated user)
Route::middleware('jwt.auth')->group(function () {
    Route::get('/me', [UserNotificationController::class, 'list']);
    Route::get('/me/preferences', [UserNotificationController::class, 'getPreferences']);
    Route::put('/me/preferences', [UserNotificationController::class, 'updatePreferences']);
});

// Admin routes (ADMIN role only)
Route::middleware(['jwt.auth', 'role:ADMIN'])->prefix('admin')->group(function () {
    Route::get('/notifications', [AdminNotificationController::class, 'list']);
    Route::get('/notifications/{id}', [AdminNotificationController::class, 'show']);
    Route::post('/notifications/{id}/retry', [AdminNotificationController::class, 'retry']);
    Route::get('/stats', [AdminNotificationController::class, 'stats']);
    Route::get('/suppressions', [AdminNotificationController::class, 'listSuppressions']);
    Route::delete('/suppressions/{hash}', [AdminNotificationController::class, 'deleteSuppression']);
});

// Resend Webhooks (§8 & §9: public, Svix signature verified)
Route::post('/webhooks/resend', [WebhookController::class, 'handleResend']);

// Dev endpoints (§9 & §13: local/dev only)
Route::prefix('dev')->group(function () {
    Route::post('/events', [DevController::class, 'injectEvent']);
    Route::post('/contacts', [DevController::class, 'seedContact']);
    Route::get('/preview/{template}', [DevController::class, 'previewTemplate']);
});
