@extends('emails.layout', ['headerTitle' => 'Payment Failed'])

@section('content')
    <h2 style="color: #ffffff; margin-top: 0;">Payment Could Not Be Processed</h2>
    <p>Your payment attempt for <strong>{{ $eventTitle }}</strong> was unsuccessful.</p>

    <div class="card">
        <div class="row">
            <span class="label">Event:</span>
            <span class="value">{{ $eventTitle }}</span>
        </div>
        <div class="row">
            <span class="label">Booking ID:</span>
            <span class="value">{{ $bookingId }}</span>
        </div>
        <div class="row">
            <span class="label">Attempted Amount:</span>
            <span class="value" style="color: #f87171; font-size: 16px;">{{ $amountFormatted }}</span>
        </div>
        <div class="row">
            <span class="label">Attempted At:</span>
            <span class="value">{{ $failedAtFormatted }}</span>
        </div>
    </div>

    <p style="color: #94a3b8; font-size: 14px;">
        No funds were deducted from your account. Your seat hold may expire shortly, so please retry your payment to secure your tickets.
    </p>

    <div style="text-align: center;">
        <a href="{{ $appUrl }}/bookings/{{ $bookingId }}/pay" class="button">Retry Payment</a>
    </div>
@endsection
