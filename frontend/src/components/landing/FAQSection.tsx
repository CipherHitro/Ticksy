import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const FAQ_ITEMS = [
  {
    question: 'How does the 10-minute seat hold guarantee zero double-bookings?',
    answer: 'When you select a seat, Ticksy acquires a distributed lock in Redis for exactly 600 seconds (10 minutes) before the order enters MySQL. If your checkout session expires or you cancel, the lock dissolves automatically and the seat becomes available to the next fan in queue.',
  },
  {
    question: 'Can I get a refund if I cannot attend the event?',
    answer: 'Yes. Attendees can request a 1-tap refund directly from the "My Tickets" tab. The system cancels the booking in MySQL, revokes the QR ticket stub, and automatically reflects the deduction in the organizer’s append-only ledger.',
  },
  {
    question: 'What is the flash-sale waiting room?',
    answer: 'For high-demand drops, incoming traffic is metered by a token bucket queue. Fans receive a deterministic position in line and are admitted in batches as seats are held or released. This prevents database starvation and eliminates scalper bot races.',
  },
  {
    question: 'How are organizer payouts calculated and audited?',
    answer: 'Ticksy’s Ledger Service runs on event sourcing with KurrentDB and CQRS. Every ticket sale, 5% platform fee, attendee refund, and bank payout is recorded as an immutable event. No row can ever be modified or deleted; corrections are handled via explicit reversals.',
  },
  {
    question: 'What payment methods are supported?',
    answer: 'Ticksy supports all Indian payment methods via Razorpay: UPI (Google Pay, PhonePe, Paytm, Cred), Debit/Credit Cards (RuPay, Visa, Mastercard), and Netbanking across all major Indian banks.',
  },
];

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq-section" className="bg-[#EDE8DD] text-[#0B0A08] py-24 border-b border-hairline-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column (5 cols): Heading & Editorial Note */}
          <div className="lg:col-span-5 space-y-4">
            <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 font-semibold">
              TRANSPARENCY FIRST
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0B0A08] leading-tight">
              Frequently asked questions
            </h2>
            <p className="font-sans text-base text-[#0B0A08]/75 leading-relaxed">
              Everything you need to know about our flash-sale waiting room, distributed seat locks, and tamper-proof ledger.
            </p>
          </div>

          {/* Right Column (7 cols): Hairline Accordion */}
          <div className="lg:col-span-7 divide-y divide-[#0B0A08]/15 border-y border-[#0B0A08]/15">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openIndex === idx;

              return (
                <div key={idx} className="py-5">
                  <button
                    onClick={() => toggle(idx)}
                    className="w-full flex items-center justify-between text-left group"
                  >
                    <span className="font-serif text-xl sm:text-2xl text-[#0B0A08] group-hover:text-[#FF4F1F] transition-colors pr-4">
                      {item.question}
                    </span>
                    <span className="p-1 rounded-[2px] border border-[#0B0A08]/20 group-hover:border-[#0B0A08]/60 transition-colors shrink-0">
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#0B0A08]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#0B0A08]" />
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 pr-8 font-sans text-sm text-[#0B0A08]/75 leading-relaxed">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
