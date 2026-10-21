<?php

declare(strict_types=1);

namespace App\Infrastructure\Redis;

use App\Domain\Notification\Category;
use Illuminate\Support\Facades\Redis;

class PreferenceStore
{
    private const PREFIX = 'prefs:';

    /**
     * @return array{emailReminders: bool, emailProductUpdates: bool}
     */
    public function get(string $userId): array
    {
        $key = self::PREFIX.$userId;
        $data = Redis::hgetall($key);

        return [
            'emailReminders' => isset($data['emailReminders']) ? (bool) (int) $data['emailReminders'] : true,
            'emailProductUpdates' => isset($data['emailProductUpdates']) ? (bool) (int) $data['emailProductUpdates'] : false,
        ];
    }

    /**
     * @param  array{emailReminders?: bool, emailProductUpdates?: bool}  $prefs
     */
    public function update(string $userId, array $prefs): void
    {
        $key = self::PREFIX.$userId;
        $fields = [];

        if (array_key_exists('emailReminders', $prefs)) {
            $fields['emailReminders'] = $prefs['emailReminders'] ? '1' : '0';
        }

        if (array_key_exists('emailProductUpdates', $prefs)) {
            $fields['emailProductUpdates'] = $prefs['emailProductUpdates'] ? '1' : '0';
        }

        if (! empty($fields)) {
            Redis::hmset($key, $fields);
        }
    }

    public function allows(string $userId, Category $category): bool
    {
        if ($category === Category::TRANSACTIONAL) {
            return true;
        }

        $prefs = $this->get($userId);

        return match ($category) {
            Category::REMINDERS => $prefs['emailReminders'],
            Category::PRODUCT_UPDATES => $prefs['emailProductUpdates'],
        };
    }
}
