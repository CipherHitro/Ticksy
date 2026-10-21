@extends('emails.layout', ['headerTitle' => 'Payout Completed'])

@section('content')
    <h2 style="color: #ffffff; margin-top: 0;">Earnings Transfer Completed</h2>
    <p>Good news! Your organizer payout has been processed and sent to your bank account.</p>

    <div class="card">
        <div class="row">
            <span class="label">Payout ID:</span>
            <span class="value">{{ $payoutId }}</span>
        </div>
        <div class="row">
            <span class="label">Amount:</span>
            <span class="value" style="color: #34d399; font-size: 16px;">{{ $amountFormatted }}</span>
        </div>
        <div class="row">
            <span class="label">Completed At:</span>
            <span class="value">{{ $completedAtFormatted }}</span>
        </div>
    </div>

    <div style="text-align: center;">
        <a href="{{ $appUrl }}/organizer/payouts" class="button">View Payout History</a>
    </div>
@endsection
