import React from 'react';
import { TicketStub } from '../common/TicketStub';
import type { Ticket } from '../../types';
import { Zap, Send, RotateCcw } from 'lucide-react';

export const TicketSection: React.FC = () => {
  const sampleTicket: Ticket = {
    id: 'tkt-preview-001',
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
    qrCodeValue: 'ticksy:verified:TK-0C8672BE:0c8672be-bd32-4e2b-a25a-696c24cc44ba',
  };

  return (
    <section className="bg-[#0B0A08] text-[#EDE8DD] py-24 border-b border-hairline-dark paper-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="font-mono text-xs uppercase tracking-widest text-[#FF4F1F] mb-3">
            THE PHYSICAL ARTIFACT
          </div>
          <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#EDE8DD]">
            Your ticket is an asset
          </h2>
          <p className="mt-3 font-sans text-sm text-[#EDE8DD]/70">
            A verifiable pass signed by the auth microservice, readable offline by venue gate scanners, and revocable in one tap.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Centered Ticket Stub (8 cols) */}
          <div className="lg:col-span-8 flex justify-center">
            <div className="w-full max-w-2xl transform transition-transform duration-300 hover:scale-[1.01]">
              <TicketStub ticket={sampleTicket} showActions={false} />
            </div>
          </div>

          {/* Three Short Lines & Assurances (4 cols) */}
          <div className="lg:col-span-4 space-y-6 font-mono text-xs text-[#EDE8DD]/80">
            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px] flex items-start gap-3">
              <Zap className="w-5 h-5 text-[#FF4F1F] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#EDE8DD] uppercase tracking-wider mb-1">
                  Instant Delivery
                </div>
                <p className="font-sans text-xs text-[#EDE8DD]/60">
                  Ticket stub is generated within 42ms of payment capture. Available in Apple Wallet, Google Wallet, and via email.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px] flex items-start gap-3">
              <Send className="w-5 h-5 text-[#EDE8DD] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#EDE8DD] uppercase tracking-wider mb-1">
                  P2P Transfer to Friends
                </div>
                <p className="font-sans text-xs text-[#EDE8DD]/60">
                  Transfer any held seat directly to another verified attendee email. The original QR code revokes immediately.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px] flex items-start gap-3">
              <RotateCcw className="w-5 h-5 text-[#B8975A] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#EDE8DD] uppercase tracking-wider mb-1">
                  One-Tap Refunds
                </div>
                <p className="font-sans text-xs text-[#EDE8DD]/60">
                  Cancel up to 48 hours before the show. The payment microservice refunds via Razorpay and the ledger records the reversal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
