@extends('emails.layout', ['headerTitle' => 'Payout Issue'])

@section('content')
    <h2 style="color: #ffffff; margin-top: 0;">Attention: Payout Failed</h2>
    <p>We encountered an issue while processing your payout transfer.</p>

    <div class="card">
        <div class="row">
            <span class="label">Payout ID:</span>
            <span class="value">{{ $payoutId }}</span>
        </div>
        <div class="row">
            <span class="label">Amount:</span>
            <span class="value" style="color: #f87171; font-size: 16px;">{{ $amountFormatted }}</span>
        </div>
        <div class="row">
            <span class="label">Attempted At:</span>
            <span class="value">{{ $failedAtFormatted }}</span>
        </div>
    </div>

    <p style="color: #cbd5e1;">
        Please review your bank account and payout details in the organizer dashboard. If your details are up to date, our support team will retry the payout automatically.
    </p>

    <div style="text-align: center;">
        <a href="{{ $appUrl }}/organizer/payouts" class="button">Review Bank Details</a>
    </div>
@endsection
