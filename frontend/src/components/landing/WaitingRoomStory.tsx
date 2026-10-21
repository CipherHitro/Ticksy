import React, { useState } from 'react';
import { TicketStub } from '../common/TicketStub';
import type { Ticket } from '../../types';
import { Users, Crosshair, Clock, CheckCircle } from 'lucide-react';

const storyTicket: Ticket = {
  id: 'tkt-story-001',
  serialNumber: 'TK-0C8672BE',
  eventId: 'evt-001',
  eventTitle: 'Bangalore Open Air 2026',
  eventDate: '2026-11-14 · 16:00 IST',
  venue: 'Jayamahal Palace Grounds',
  city: 'Bengaluru',
  seats: ['A-1', 'A-2'],
  tierName: 'VIP Arena',
  attendeeName: 'Aarav Sharma',
  attendeeEmail: 'aarav@ticksy.com',
  amountMinor: 499800,
  currency: 'INR',
  status: 'VALID',
  purchasedAt: '2026-10-21T17:03:14Z',
  qrCodeValue: 'ticksy:verified:TK-0C8672BE',
};

export const WaitingRoomStory: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(0);

  const steps = [
    {
      num: '01',
      title: 'Join the queue',
      caption:
        'When high-demand tickets drop at 7:00 PM, incoming traffic is metered by a token bucket rate limiter. No crashing servers, no bot bypasses.',
      metric: 'You are #1,284 · about 3 min',
      icon: Users,
    },
    {
      num: '02',
      title: 'Pick your seats',
      caption:
        'Enter the live seat map where unavailable seats are clearly marked and seats currently being inspected by fans pulse in real time.',
      metric: 'Live viewers: 2,410 · 14 rows active',
      icon: Crosshair,
    },
    {
      num: '03',
      title: 'Hold for 8 minutes',
      caption:
        'Clicking a seat locks it in Redis for 480 seconds. Nobody else can book it while you review your summary and enter payment info.',
      metric: 'Distributed Lock Active · 07:59',
      icon: Clock,
    },
    {
      num: '04',
      title: 'Pay and receive',
      caption:
        'Upon instant Razorpay webhook capture, a saga confirms the MySQL booking, publishes the outbox event, and issues a cryptographic ticket stub.',
      metric: 'Saga Completed · 42ms capture',
      icon: CheckCircle,
    },
  ];

  return (
    <section id="rush-section" className="bg-[#0B0A08] text-[#EDE8DD] py-24 border-b border-hairline-dark paper-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className="font-mono text-xs uppercase tracking-widest text-[#FF4F1F] mb-3">
            THE ARCHITECTURE STORY
          </div>
          <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#EDE8DD] leading-tight">
            The 7 PM rush: from queue to ticket stub
          </h2>
          <p className="mt-4 font-sans text-base text-[#EDE8DD]/70">
            How Ticksy solves the flash-sale concurrency problem without scalpers, race conditions, or double-bookings.
          </p>
        </div>

        {/* 2-Column Story Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Interactive Step Selector (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {steps.map((step, idx) => {
              const isActive = activeStep === idx;
              const Icon = step.icon;

              return (
                <div
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`p-6 border rounded-[3px] cursor-pointer transition-all duration-300 ${
                    isActive
                      ? 'bg-[#161410] border-[#FF4F1F] shadow-lg'
                      : 'bg-transparent border-hairline-dark hover:border-[#EDE8DD]/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-[#EDE8DD]/40">
                      STEP {step.num}
                    </span>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF4F1F]' : 'text-[#EDE8DD]/30'}`} />
                  </div>

                  <h3 className="font-serif text-2xl text-[#EDE8DD] mb-2">
                    {step.title}
                  </h3>

                  <p className="font-sans text-xs text-[#EDE8DD]/70 leading-relaxed mb-3">
                    {step.caption}
                  </p>

                  <div className="font-mono text-[11px] text-[#FF4F1F] bg-[#FF4F1F]/10 border border-[#FF4F1F]/20 px-2.5 py-1 rounded-[2px] inline-block">
                    {step.metric}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Visual Stage (7 cols) */}
          <div className="lg:col-span-7 flex justify-center items-center">
            <div className="w-full max-w-lg p-8 border border-hairline-dark bg-[#12100D] rounded-[3px] shadow-2xl relative min-h-[380px] flex flex-col justify-center">
              {/* Step 0: Queue Simulation */}
              {activeStep === 0 && (
                <div className="text-center space-y-6">
                  <div className="font-mono text-xs uppercase tracking-widest text-[#EDE8DD]/50">
                    ADMISSION CONTROLLER · FAIR QUEUE
                  </div>
                  <div className="font-mono text-6xl md:text-7xl font-bold text-[#EDE8DD] tabular-nums">
                    #1,284
                  </div>
                  <div className="font-mono text-sm text-[#FF4F1F]">
                    ESTIMATED ADMISSION: ~ 2 MIN 40 SEC
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-[#EDE8DD]/10 h-1.5 rounded-[1px] overflow-hidden">
                    <div className="w-3/4 h-full bg-[#FF4F1F] transition-all duration-500" />
                  </div>
                  <p className="font-sans text-xs text-[#EDE8DD]/60">
                    250 fans are admitted every 30 seconds to match available seat checkout bandwidth.
                  </p>
                </div>
              )}

              {/* Step 1: Pick seats live pulsing */}
              {activeStep === 1 && (
                <div className="space-y-4">
                  <div className="flex justify-between font-mono text-xs text-[#EDE8DD]/60 border-b border-hairline-dark pb-2">
                    <span>SEAT MAP: BALCONY TIER</span>
                    <span className="text-[#FF4F1F]">● 34 VIEWING NOW</span>
                  </div>
                  <div className="grid grid-cols-8 gap-2 py-4">
                    {Array.from({ length: 32 }).map((_, i) => {
                      const isHot = i === 10 || i === 11 || i === 18;
                      const isTaken = i === 3 || i === 4 || i === 22 || i === 23;
                      return (
                        <div
                          key={i}
                          className={`h-7 rounded-[2px] flex items-center justify-center font-mono text-[10px] border ${
                            isHot
                              ? 'border-[#FF4F1F] bg-[#FF4F1F]/20 text-[#FF4F1F] animate-pulse'
                              : isTaken
                              ? 'border-transparent bg-[#EDE8DD]/10 text-[#EDE8DD]/30 line-through'
                              : 'border-hairline-dark bg-[#EDE8DD]/5 text-[#EDE8DD]/80 hover:border-[#EDE8DD]/50'
                          }`}
                        >
                          {String.fromCharCode(65 + Math.floor(i / 8)) + ((i % 8) + 1)}
                        </div>
                      );
                    })}
                  </div>
                  <div className="font-mono text-xs text-[#EDE8DD]/50 text-center">
                    Pulsing red indicates seats currently under consideration by others in the room.
                  </div>
                </div>
              )}

              {/* Step 2: 8-minute Hold Countdown Ring */}
              {activeStep === 2 && (
                <div className="text-center space-y-6">
                  <div className="font-mono text-xs uppercase tracking-widest text-[#FF4F1F]">
                    REDIS DISTRIBUTED LOCK ACQUIRED
                  </div>
                  <div className="relative inline-flex items-center justify-center w-36 h-36 mx-auto rounded-full border-4 border-[#FF4F1F]/30">
                    <div className="absolute inset-0 rounded-full border-4 border-[#FF4F1F] border-t-transparent animate-spin" />
                    <div className="font-mono text-3xl font-bold text-[#EDE8DD] tabular-nums">
                      07:59
                    </div>
                  </div>
                  <div className="font-mono text-xs text-[#EDE8DD]/80">
                    SEATS LOCKED: <span className="font-bold text-[#EDE8DD]">F-12, F-13</span> (₹2,999)
                  </div>
                  <p className="font-sans text-xs text-[#EDE8DD]/60">
                    Your seats are immune to race conditions. If uncompleted after 8 minutes, the lock auto-dissolves.
                  </p>
                </div>
              )}

              {/* Step 3: Verified Physical Ticket */}
              {activeStep === 3 && (
                <div className="space-y-4">
                  <div className="font-mono text-xs uppercase tracking-widest text-emerald-400 text-center">
                    TRANSACTIONAL SAGA COMPLETE
                  </div>
                  <div className="transform scale-90 sm:scale-95 origin-center">
                    <TicketStub ticket={storyTicket} showActions={false} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
