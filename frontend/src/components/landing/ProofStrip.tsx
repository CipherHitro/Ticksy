import React from 'react';

export const PROOF_METRICS = [
  { value: '14,200', label: 'SEATS CHECKED / SEC', note: 'k6 load test · 0 double-bookings' },
  { value: '0', label: 'OVERSOLD SEATS', note: 'Redis distributed lock + MySQL row lock' },
  { value: '42ms', label: 'P95 BOOKING TIME', note: 'End-to-end hold & saga confirm' },
  { value: '< 1m', label: 'PAYOUT VISIBILITY', note: 'Immutable KurrentDB event projection' },
];

export const ProofStrip: React.FC = () => {
  return (
    <section className="bg-[#EDE8DD] text-[#0B0A08] border-b border-hairline-light py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {PROOF_METRICS.map((metric, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between border-l border-[#0B0A08]/15 pl-6 py-2"
            >
              <div>
                <span className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-[#0B0A08] tabular-nums">
                  {metric.value}
                </span>
                <div className="mt-2 font-mono text-xs font-semibold tracking-wider uppercase text-[#0B0A08]">
                  {metric.label}
                </div>
              </div>
              <div className="mt-3 font-mono text-[11px] text-[#0B0A08]/60">
                {metric.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
