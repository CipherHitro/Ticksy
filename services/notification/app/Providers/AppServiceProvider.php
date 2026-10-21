<?php

declare(strict_types=1);

namespace App\Providers;

use App\Infrastructure\Email\EmailGateway;
use App\Infrastructure\Email\LogEmailGateway;
use App\Infrastructure\Email\ResendEmailGateway;
use App\Infrastructure\Observability\MetricsService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(EmailGateway::class, function ($app) {
            $driver = config('notification.email.driver', 'log');

            if ($driver === 'resend') {
                return $app->make(ResendEmailGateway::class);
            }

            return $app->make(LogEmailGateway::class);
        });

        $this->app->singleton(MetricsService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
