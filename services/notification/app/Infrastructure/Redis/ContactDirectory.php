<?php

declare(strict_types=1);

namespace App\Infrastructure\Redis;

use Illuminate\Support\Facades\Redis;

class ContactDirectory
{
    private const PREFIX = 'contact:';

    /**
     * @return array{userId: string, email: string, name: string, role: string, updatedAt: string}|null
     */
    public function get(string $userId): ?array
    {
        $key = self::PREFIX.$userId;
        $data = Redis::hgetall($key);

        if (empty($data) || empty($data['email'])) {
            return null;
        }

        return [
            'userId' => $userId,
            'email' => $data['email'],
            'name' => $data['name'] ?? '',
            'role' => $data['role'] ?? 'ATTENDEE',
            'updatedAt' => $data['updatedAt'] ?? now()->toIso8601ZuluString(),
        ];
    }

    public function upsert(string $userId, string $email, string $name, string $role, ?string $updatedAt = null): void
    {
        $key = self::PREFIX.$userId;
        $updatedAt ??= now()->toIso8601ZuluString();

        Redis::hmset($key, [
            'email' => trim($email),
            'name' => trim($name),
            'role' => trim($role),
            'updatedAt' => $updatedAt,
        ]);
    }

    public function update(string $userId, ?string $email = null, ?string $name = null): void
    {
        $key = self::PREFIX.$userId;
        $fields = [];

        if ($email !== null) {
            $fields['email'] = trim($email);
        }
        if ($name !== null) {
            $fields['name'] = trim($name);
        }

        if (! empty($fields)) {
            $fields['updatedAt'] = now()->toIso8601ZuluString();
            Redis::hmset($key, $fields);
        }
    }
}
