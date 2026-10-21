<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Infrastructure\Observability\MetricsService;
use Illuminate\Http\Response;
use Prometheus\RenderTextFormat;

class MetricsController extends Controller
{
    public function metrics(MetricsService $metrics): Response
    {
        $content = $metrics->render();

        return response($content, 200, [
            'Content-Type' => RenderTextFormat::MIME_TYPE,
        ]);
    }
}
