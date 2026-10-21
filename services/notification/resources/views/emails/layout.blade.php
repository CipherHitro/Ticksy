<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $subject ?? 'Ticksy Notification' }}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            margin: 0;
            padding: 0;
            line-height: 1.6;
        }
        .wrapper {
            width: 100%;
            background-color: #0f172a;
            padding: 40px 10px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #1e293b;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            border: 1px solid #334155;
        }
        .header {
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            padding: 28px 32px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            color: #ffffff;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }
        .content {
            padding: 32px;
            color: #e2e8f0;
        }
        .card {
            background-color: #0f172a;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid #334155;
        }
        .row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #1e293b;
        }
        .row:last-child {
            border-bottom: none;
        }
        .label {
            color: #94a3b8;
            font-size: 14px;
        }
        .value {
            color: #f8fafc;
            font-weight: 600;
            font-size: 14px;
        }
        .button {
            display: inline-block;
            background: #6366f1;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 28px;
            border-radius: 6px;
            font-weight: 600;
            margin-top: 20px;
            text-align: center;
        }
        .footer {
            padding: 24px 32px;
            text-align: center;
            font-size: 12px;
            color: #64748b;
            border-top: 1px solid #334155;
            background-color: #1a2234;
        }
        .footer a {
            color: #818cf8;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <h1>{{ $headerTitle ?? 'Ticksy' }}</h1>
            </div>
            <div class="content">
                @yield('content')
            </div>
            <div class="footer">
                <p>This is a transactional email from Ticksy. Please do not reply directly to this email.</p>
                <p>&copy; {{ date('Y') }} Ticksy Events. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>
