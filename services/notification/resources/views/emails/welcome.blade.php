@extends('emails.layout', ['headerTitle' => 'Welcome to Ticksy'])

@section('content')
    <h2 style="color: #ffffff; margin-top: 0;">Hello, {{ $name }}!</h2>
    <p>Welcome to <strong>Ticksy</strong>, your live event ticketing platform. We're thrilled to have you join our community.</p>
    <div class="card">
        <div class="row">
            <span class="label">Email Address:</span>
            <span class="value">{{ $email }}</span>
        </div>
        <div class="row">
            <span class="label">Account Type:</span>
            <span class="value">{{ $role }}</span>
        </div>
        <div class="row">
            <span class="label">Member Since:</span>
            <span class="value">{{ $registeredAtFormatted }}</span>
        </div>
    </div>
    <p>Browse the latest concerts, tech meetups, and workshops happening around you.</p>
    <div style="text-align: center;">
        <a href="{{ $appUrl }}/events" class="button">Explore Events</a>
    </div>
@endsection
