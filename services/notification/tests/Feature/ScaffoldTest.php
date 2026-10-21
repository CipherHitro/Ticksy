<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class ScaffoldTest extends TestCase
{
    public function test_health_live_endpoint_returns_ok(): void
    {
        $response = $this->get('/health/live');

        $response->assertStatus(200);
        $response->assertJson([
            'status' => 'UP',
            'service' => 'notification',
        ]);
        $this->assertNotEmpty($response->headers->get('X-Request-Id'));
    }

    public function test_echoes_provided_request_id(): void
    {
        $customId = 'my-custom-request-id-12345';
        $response = $this->withHeader('X-Request-Id', $customId)->get('/health/live');

        $response->assertStatus(200);
        $this->assertEquals($customId, $response->headers->get('X-Request-Id'));
    }

    public function test_not_found_endpoint_returns_agents_envelope(): void
    {
        $response = $this->get('/non-existent-route-for-testing');

        $response->assertStatus(404);
        $response->assertJson([
            'success' => false,
            'code' => 'NOT_FOUND',
            'message' => 'Resource not found',
        ]);
        $this->assertNotEmpty($response->json('requestId'));
        $this->assertNotEmpty($response->headers->get('X-Request-Id'));
        $this->assertEquals($response->json('requestId'), $response->headers->get('X-Request-Id'));
    }

    public function test_method_not_allowed_returns_agents_envelope(): void
    {
        $response = $this->post('/health/live');

        $response->assertStatus(405);
        $response->assertJson([
            'success' => false,
            'code' => 'METHOD_NOT_ALLOWED',
            'message' => 'Method not allowed',
        ]);
        $this->assertNotEmpty($response->json('requestId'));
    }
}
