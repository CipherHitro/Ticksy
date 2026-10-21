<?php

declare(strict_types=1);

namespace Tests\Feature;

use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class JwtAuthTest extends TestCase
{
    private string $privateKey;

    private string $publicKey;

    private array $jwks;

    private string $kid = 'test-key-id-1';

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        // Generate RSA key pair for testing
        $res = openssl_pkey_new([
            'digest_alg' => 'sha256',
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);

        $privKey = '';
        openssl_pkey_export($res, $privKey);
        $this->privateKey = $privKey;
        $details = openssl_pkey_get_details($res);
        $this->publicKey = $details['key'];

        // Convert to JWK format
        $n = rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '=');
        $e = rtrim(strtr(base64_encode($details['rsa']['e']), '+/', '-_'), '=');

        $this->jwks = [
            'keys' => [
                [
                    'kty' => 'RSA',
                    'use' => 'sig',
                    'alg' => 'RS256',
                    'kid' => $this->kid,
                    'n' => $n,
                    'e' => $e,
                ],
            ],
        ];

        // Mock JWKS endpoint
        Http::fake([
            config('notification.jwt.jwks_url') => Http::response($this->jwks, 200),
        ]);
    }

    private function generateToken(array $overrides = [], ?string $customPrivateKey = null, ?string $kid = null, string $alg = 'RS256'): string
    {
        $payload = array_merge([
            'sub' => '11111111-1111-4111-a111-111111111111',
            'email' => 'attendee@ticksy.local',
            'name' => 'Alice Attendee',
            'role' => 'ATTENDEE',
            'iss' => 'ticksy-auth',
            'aud' => 'ticksy-api',
            'iat' => time(),
            'exp' => time() + 900,
        ], $overrides);

        $key = $customPrivateKey ?? $this->privateKey;
        $headers = [];
        if ($kid !== null) {
            $headers['kid'] = $kid;
        } elseif ($alg !== 'none') {
            $headers['kid'] = $this->kid;
        }

        return JWT::encode($payload, $key, $alg, head: $headers);
    }

    public function test_missing_authorization_header_returns_401(): void
    {
        $response = $this->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
        $this->assertNotEmpty($response->json('requestId'));
    }

    public function test_valid_token_allows_access(): void
    {
        $token = $this->generateToken();
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'userId' => '11111111-1111-4111-a111-111111111111',
                'role' => 'ATTENDEE',
            ],
        ]);
    }

    public function test_expired_token_returns_401(): void
    {
        $token = $this->generateToken(['exp' => time() - 300]);
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    public function test_wrong_rsa_key_signature_returns_401(): void
    {
        $otherRes = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        openssl_pkey_export($otherRes, $wrongPrivateKey);

        $token = $this->generateToken([], customPrivateKey: $wrongPrivateKey);
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    public function test_alg_none_token_rejected_with_401(): void
    {
        // Construct an unsigned / alg:none token manually
        $header = rtrim(strtr(base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'none'])), '+/', '-_'), '=');
        $payload = rtrim(strtr(base64_encode(json_encode([
            'sub' => '11111111-1111-4111-a111-111111111111',
            'iss' => 'ticksy-auth',
            'aud' => 'ticksy-api',
            'exp' => time() + 900,
        ])), '+/', '-_'), '=');
        $token = "{$header}.{$payload}.";

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    public function test_hs256_confusion_token_rejected_with_401(): void
    {
        // Try signing with HMAC using public key as HMAC secret (algorithm confusion attack)
        $token = $this->generateToken([], customPrivateKey: $this->publicKey, alg: 'HS256');

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    public function test_wrong_issuer_returns_401(): void
    {
        $token = $this->generateToken(['iss' => 'evil-issuer']);
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    public function test_wrong_audience_returns_401(): void
    {
        $token = $this->generateToken(['aud' => 'different-api']);
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-auth');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    public function test_attendee_accessing_admin_route_returns_403(): void
    {
        $token = $this->generateToken(['role' => 'ATTENDEE']);
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-admin');

        $response->assertStatus(403);
        $response->assertJson([
            'success' => false,
            'code' => 'FORBIDDEN',
        ]);
    }

    public function test_admin_accessing_admin_route_succeeds(): void
    {
        $token = $this->generateToken([
            'sub' => '99999999-9999-4999-a999-999999999999',
            'role' => 'ADMIN',
        ]);
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/notifications/test-admin');

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'admin' => true,
                'userId' => '99999999-9999-4999-a999-999999999999',
            ],
        ]);
    }
}
