@extends('emails.layout', ['headerTitle' => 'Refund Processed'])

@section('content')
    <h2 style="color: #ffffff; margin-top: 0;">Refund Confirmed</h2>
    <p>Your refund for <strong>{{ $eventTitle }}</strong> has been processed successfully.</p>

    <div class="card">
        <div class="row">
            <span class="label">Booking Reference:</span>
            <span class="value">{{ $bookingId }}</span>
        </div>
        <div class="row">
            <span class="label">Event:</span>
            <span class="value">{{ $eventTitle }}</span>
        </div>
        <div class="row">
            <span class="label">Refund Amount:</span>
            <span class="value" style="color: #38bdf8; font-size: 16px;">{{ $refundAmountFormatted }}</span>
        </div>
        <div class="row">
            <span class="label">Processed At:</span>
            <span class="value">{{ $refundedAtFormatted }}</span>
        </div>
    </div>

    <p style="font-size: 14px; color: #94a3b8;">
        The refunded amount will reflect in your original payment method within 5-7 business days, depending on your bank's policy.
    </p>

    <div style="text-align: center;">
        <a href="{{ $appUrl }}/bookings" class="button">My Bookings</a>
    </div>
@endsection
