<?php

declare(strict_types=1);

namespace App\Infrastructure\Auth;

use Firebase\JWT\JWK;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class JwksService
{
    private const CACHE_KEY = 'jwks:cache';

    private const LAST_REFETCH_KEY = 'jwks:last_refetch';

    /**
     * @return array<string, Key> Map of kid => Key
     */
    public function getKeys(): array
    {
        $jwks = Cache::get(self::CACHE_KEY);

        if (! is_array($jwks)) {
            $jwks = $this->fetchJwks();
        }

        return $this->parseKeySet($jwks);
    }

    public function getKey(string $kid): Key
    {
        $keys = $this->getKeys();

        if (isset($keys[$kid])) {
            return $keys[$kid];
        }

        // Unknown kid: check if we can refetch (at most once per minute)
        $lastRefetch = Cache::get(self::LAST_REFETCH_KEY);
        if ($lastRefetch === null) {
            Log::info("Unknown kid '{$kid}', refetching JWKS from issuer");
            Cache::put(self::LAST_REFETCH_KEY, time(), 60);
            $jwks = $this->fetchJwks();
            $keys = $this->parseKeySet($jwks);

            if (isset($keys[$kid])) {
                return $keys[$kid];
            }
        }

        throw new RuntimeException("Unknown token key ID (kid: '{$kid}')");
    }

    /**
     * @return array<string, mixed>
     */
    public function fetchJwks(): array
    {
        $jwksUrl = (string) config('notification.jwt.jwks_url');
        $cacheTtl = (int) config('notification.jwt.jwks_cache_ttl', 300);

        try {
            $response = Http::timeout(3)->get($jwksUrl);

            if (! $response->successful()) {
                throw new RuntimeException("Failed to fetch JWKS from {$jwksUrl}: HTTP {$response->status()}");
            }

            $jwks = $response->json();
            if (! is_array($jwks) || ! isset($jwks['keys']) || ! is_array($jwks['keys'])) {
                throw new RuntimeException("Invalid JWKS structure returned from {$jwksUrl}");
            }

            Cache::put(self::CACHE_KEY, $jwks, $cacheTtl);

            return $jwks;
        } catch (\Throwable $e) {
            Log::error("Error fetching JWKS: {$e->getMessage()}", ['url' => $jwksUrl]);
            throw new RuntimeException("Unable to retrieve JWKS: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * @param  array<string, mixed>  $jwks
     * @return array<string, Key>
     */
    private function parseKeySet(array $jwks): array
    {
        // Enforce RS256 algorithm only
        return JWK::parseKeySet($jwks, 'RS256');
    }
}
