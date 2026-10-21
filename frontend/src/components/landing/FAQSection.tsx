import React, { useState } from 'react';
import { FAQ_ITEMS } from '../../data/mockData';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
                    <span className="shrink-0 p-1 border border-[#0B0A08]/20 rounded-[2px] text-[#0B0A08]/60 group-hover:border-[#FF4F1F] group-hover:text-[#FF4F1F] transition-colors">
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 pr-8 font-sans text-sm text-[#0B0A08]/70 leading-relaxed">
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
