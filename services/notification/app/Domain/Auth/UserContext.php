<?php

declare(strict_types=1);

namespace App\Domain\Auth;

readonly class UserContext
{
    public function __construct(
        public string $userId,
        public string $email,
        public string $name,
        public string $role,
    ) {}

    public function isAdmin(): bool
    {
        return $this->role === 'ADMIN';
    }

    public function isOrganizer(): bool
    {
        return $this->role === 'ORGANIZER';
    }

    public function isAttendee(): bool
    {
        return $this->role === 'ATTENDEE';
    }
}
