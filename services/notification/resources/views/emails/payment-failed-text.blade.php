Payment Failed

Payment Could Not Be Processed

Your payment attempt for {{ $eventTitle }} was unsuccessful.

Details:
- Event: {{ $eventTitle }}
- Booking ID: {{ $bookingId }}
- Attempted Amount: {{ $amountFormatted }}
- Attempted At: {{ $failedAtFormatted }}

No funds were deducted from your account. Your seat hold may expire shortly, so please retry your payment:
{{ $appUrl }}/bookings/{{ $bookingId }}/pay

---
This is a transactional email from Ticksy. Please do not reply directly to this email.
(c) {{ date('Y') }} Ticksy Events. All rights reserved.
