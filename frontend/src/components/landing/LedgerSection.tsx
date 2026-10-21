import React, { useState, useEffect } from 'react';
import { formatINR } from '../../utils/formatters';
import type { LedgerEntry } from '../../types';
import { ArrowUpRight } from 'lucide-react';

interface LedgerSectionProps {
  onOpenOrganizerDashboard: () => void;
}

export const LedgerSection: React.FC<LedgerSectionProps> = ({
  onOpenOrganizerDashboard,
}) => {
  const [entries, setEntries] = useState<LedgerEntry[]>([
    {
      id: 'led-1',
      timestamp: '18:14:02',
      type: 'TICKET_SALE',
      amountMinor: 240000,
      runningBalanceMinor: 14250000,
      referenceId: 'TKS-8821-X09',
      description: 'Ticket sale (2 seats · Fan Pit)',
    },
    {
      id: 'led-2',
      timestamp: '18:14:03',
      type: 'PLATFORM_FEE',
      amountMinor: -12000,
      runningBalanceMinor: 14238000,
      referenceId: 'FEE-8821',
      description: 'Platform fee 5%',
    },
    {
      id: 'led-3',
      timestamp: '17:58:20',
      type: 'REFUND',
      amountMinor: -120000,
      runningBalanceMinor: 14358000,
      referenceId: 'REF-0491',
      description: 'Refund (Seat B-14)',
    },
    {
      id: 'led-4',
      timestamp: '16:30:00',
      type: 'PAYOUT',
      amountMinor: -4000000,
      runningBalanceMinor: 14478000,
      referenceId: 'PO-2026-091',
      description: 'Bank transfer (HDFC ...8812)',
    },
    {
      id: 'led-5',
      timestamp: '15:22:18',
      type: 'TICKET_SALE',
      amountMinor: 499900,
      runningBalanceMinor: 18478000,
      referenceId: 'TKS-3312-A01',
      description: 'Ticket sale (VIP Lounge)',
    },
  ]);

  // Live simulation: every 4 seconds, a new live ledger entry slides in
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const types: Array<{ type: 'TICKET_SALE' | 'PLATFORM_FEE' | 'REFUND'; amt: number; desc: string }> = [
        { type: 'TICKET_SALE', amt: 149900, desc: 'Ticket sale (1 Balcony)' },
        { type: 'PLATFORM_FEE', amt: -7500, desc: 'Platform fee 5%' },
        { type: 'TICKET_SALE', amt: 299900, desc: 'Ticket sale (2 Stalls)' },
        { type: 'REFUND', amt: -149900, desc: 'Attendee refund (Seat D-12)' },
      ];
      const pick = types[Math.floor(Math.random() * types.length)];
      const prevBal = entries[0]?.runningBalanceMinor || 14000000;
      const newBal = prevBal + pick.amt;

      const newEntry: LedgerEntry = {
        id: 'led-' + Date.now(),
        timestamp: timeStr,
        type: pick.type,
        amountMinor: pick.amt,
        runningBalanceMinor: newBal,
        referenceId: 'TKS-' + Math.floor(1000 + Math.random() * 9000),
        description: pick.desc,
      };

      setEntries((prev) => [newEntry, ...prev.slice(0, 5)]);
    }, 4500);

    return () => clearInterval(interval);
  }, [entries]);

  return (
    <section id="ledger-section" className="bg-[#EDE8DD] text-[#0B0A08] py-24 border-b border-hairline-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start mb-16">
          {/* Left Column (5 cols): Narrative */}
          <div className="lg:col-span-5 space-y-6">
            <div className="font-mono text-xs uppercase tracking-widest text-[#B8975A] font-semibold">
              ORGANIZER LEDGER · EVENT SOURCED
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0B0A08] leading-[1.05]">
              A payout record nobody can edit.
            </h2>
            <p className="font-sans text-base text-[#0B0A08]/80 leading-relaxed">
              Every ticket sale, platform fee, refund, and automated bank disbursement is an immutable event stored in KurrentDB.
            </p>
            <p className="font-sans text-sm text-[#0B0A08]/70 leading-relaxed">
              No row can ever be altered in place; accounting discrepancies are reconciled purely through compensations. Your bank reconciliation matches to the exact paisa.
            </p>

            <div className="pt-2">
              <button
                onClick={onOpenOrganizerDashboard}
                className="inline-flex items-center gap-2 px-5 py-3 bg-[#0B0A08] hover:bg-[#161410] text-[#EDE8DD] font-mono text-xs font-semibold rounded-[2px] transition-colors shadow-md"
              >
                <span>Launch Organizer Dashboard</span>
                <ArrowUpRight className="w-4 h-4 text-[#B8975A]" />
              </button>
            </div>
          </div>

          {/* Right Column (7 cols): Live Statement Table */}
          <div className="lg:col-span-7 bg-[#F5F2EB] border border-[#0B0A08]/20 rounded-[3px] p-6 shadow-md overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B0A08]/15 mb-3 font-mono text-xs">
              <div className="flex items-center gap-2 font-bold text-[#0B0A08]">
                <span className="w-2 h-2 rounded-full bg-[#B8975A]" />
                <span>STATEMENT · IMMUTABLE STREAM</span>
              </div>
              <div className="text-[#0B0A08]/50">CURRENCY: INR (₹)</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#0B0A08]/15 text-[#0B0A08]/50 text-[10px] uppercase">
                    <th className="py-2 pr-3">TIME</th>
                    <th className="py-2 pr-3">ENTRY DESCRIPTION</th>
                    <th className="py-2 pr-3">REFERENCE</th>
                    <th className="py-2 pr-3 text-right">AMOUNT</th>
                    <th className="py-2 text-right">BALANCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B0A08]/10">
                  {entries.map((entry) => {
                    const isNeg = entry.amountMinor < 0;
                    return (
                      <tr key={entry.id} className="transition-colors hover:bg-[#0B0A08]/5">
                        <td className="py-2.5 pr-3 text-[#0B0A08]/60 whitespace-nowrap">
                          {entry.timestamp}
                        </td>
                        <td className="py-2.5 pr-3 text-[#0B0A08] font-medium">
                          {entry.description}
                        </td>
                        <td className="py-2.5 pr-3 text-[#0B0A08]/50 text-[11px]">
                          {entry.referenceId}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right tabular-nums font-semibold whitespace-nowrap ${
                            isNeg ? 'text-[#FF4F1F]' : 'text-emerald-700'
                          }`}
                        >
                          {formatINR(entry.amountMinor)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-[#B8975A] whitespace-nowrap">
                          {formatINR(entry.runningBalanceMinor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-[#0B0A08]/15 flex items-center justify-between font-mono text-[11px] text-[#0B0A08]/60">
              <span>● CQRS REDIS PROJECTION SYNCED</span>
              <span>VERIFIED BY KURRENTDB AGGREGATE</span>
            </div>
          </div>
        </div>

        {/* 3-Card Bento Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px]">
            <div className="font-mono text-xs uppercase text-[#0B0A08]/50 mb-2">01 / REVENUE</div>
            <h3 className="font-serif text-2xl text-[#0B0A08] mb-2">Real-time sales tracking</h3>
            <p className="font-sans text-xs text-[#0B0A08]/70 leading-relaxed">
              Every ticket sold across tiers projects immediately into your gross balance with zero end-of-day batch delays.
            </p>
          </div>

          <div className="p-6 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px]">
            <div className="font-mono text-xs uppercase text-[#0B0A08]/50 mb-2">02 / REFUNDS</div>
            <h3 className="font-serif text-2xl text-[#0B0A08] mb-2">Automated compensations</h3>
            <p className="font-sans text-xs text-[#0B0A08]/70 leading-relaxed">
              When an attendee initiates a refund, the payment service calls Razorpay and the ledger posts a debit entry without manual intervention.
            </p>
          </div>

          <div className="p-6 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px]">
            <div className="font-mono text-xs uppercase text-[#B8975A] font-semibold mb-2">03 / PAYOUTS</div>
            <h3 className="font-serif text-2xl text-[#0B0A08] mb-2">Instant idempotent withdrawals</h3>
            <p className="font-sans text-xs text-[#0B0A08]/70 leading-relaxed">
              Trigger a payout anytime with an `Idempotency-Key`. Transfers route directly to your registered bank account in minor units.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
