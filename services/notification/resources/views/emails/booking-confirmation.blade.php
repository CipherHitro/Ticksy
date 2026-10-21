@extends('emails.layout', ['headerTitle' => 'Booking Confirmed!'])

@section('content')
    <h2 style="color: #ffffff; margin-top: 0;">You're going to {{ $eventTitle }}!</h2>
    <p>Your booking is confirmed. Here are your booking details:</p>

    <div class="card">
        <div class="row">
            <span class="label">Booking Reference:</span>
            <span class="value">{{ $bookingId }}</span>
        </div>
        <div class="row">
            <span class="label">Event:</span>
            <span class="value">{{ $eventTitle }}</span>
        </div>
        @if(!empty($eventStartsAtFormatted))
        <div class="row">
            <span class="label">Date & Time:</span>
            <span class="value">{{ $eventStartsAtFormatted }}</span>
        </div>
        @endif
        @if(!empty($venueName))
        <div class="row">
            <span class="label">Venue:</span>
            <span class="value">{{ $venueName }}{{ !empty($venueCity) ? ', ' . $venueCity : '' }}</span>
        </div>
        @endif
        <div class="row">
            <span class="label">Total Paid:</span>
            <span class="value" style="color: #34d399; font-size: 16px;">{{ $totalAmountFormatted }}</span>
        </div>
    </div>

    @if(!empty($items) && is_array($items))
    <h3 style="color: #ffffff; font-size: 16px; margin-top: 24px; margin-bottom: 12px;">Ticket Details</h3>
    <div class="card" style="padding: 12px 20px;">
        @foreach($items as $item)
        <div class="row">
            <span class="label">{{ $item['seatLabel'] ?? 'General' }} ({{ $item['tierName'] ?? 'Standard' }})</span>
            <span class="value">{{ $item['priceFormatted'] ?? '' }}</span>
        </div>
        @endforeach
    </div>
    @endif

    <div style="text-align: center;">
        <a href="{{ $appUrl }}/bookings/{{ $bookingId }}" class="button">View Booking</a>
    </div>
@endsection
