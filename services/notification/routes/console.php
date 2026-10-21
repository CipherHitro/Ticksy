<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

Schedule::command('notifications:sweep-stuck')->everyFiveMinutes();
Schedule::command('notifications:clean-retention')->daily();
