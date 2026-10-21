Booking Confirmed!

You're going to {{ $eventTitle }}!

Booking Details:
- Booking Reference: {{ $bookingId }}
- Event: {{ $eventTitle }}
@if(!empty($eventStartsAtFormatted))
- Date & Time: {{ $eventStartsAtFormatted }}
@endif
@if(!empty($venueName))
- Venue: {{ $venueName }}{{ !empty($venueCity) ? ', ' . $venueCity : '' }}
@endif
- Total Paid: {{ $totalAmountFormatted }}

@if(!empty($items) && is_array($items))
Ticket Details:
@foreach($items as $item)
* {{ $item['seatLabel'] ?? 'General' }} ({{ $item['tierName'] ?? 'Standard' }}): {{ $item['priceFormatted'] ?? '' }}
@endforeach
@endif

View your booking: {{ $appUrl }}/bookings/{{ $bookingId }}

---
This is a transactional email from Ticksy. Please do not reply directly to this email.
(c) {{ date('Y') }} Ticksy Events. All rights reserved.
