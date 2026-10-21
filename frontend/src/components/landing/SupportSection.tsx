import React, { useState } from 'react';
import { Send, FileText, Bot, User as UserIcon } from 'lucide-react';
import type { SupportMessage } from '../../types';

export const SupportSection: React.FC = () => {
  const [messages, setMessages] = useState<SupportMessage[]>([
    {
      id: 'msg-1',
      sender: 'user',
      text: 'Can I get a refund if I can’t attend the Bangalore Open Air event?',
      timestamp: '18:10',
    },
    {
      id: 'msg-2',
      sender: 'assistant',
      text: 'Yes. Full refunds can be requested directly from your "My Tickets" dashboard up to 48 hours prior to event doors opening. Your seat lock will be released back to the queue and the funds returned via your original payment method.',
      citation: 'Refund Policy · §3.2 (Attendee Rights)',
      timestamp: '18:10',
    },
  ]);

  const [input, setInput] = useState('');

  const quickPrompts = [
    'How does the 8-minute seat hold work?',
    'What happens if my payment fails at checkout?',
    'How do organizers receive bank payouts?',
  ];

  const handleSend = (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim()) return;

    const userMsg: SupportMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: q,
      timestamp: 'Just now',
    };

    let replyText = 'Ticksy’s admission queue meters traffic at 250 requests per cycle, ensuring system stability.';
    let citation = 'System Spec · §4.1 (Queue Architecture)';

    if (q.toLowerCase().includes('hold')) {
      replyText = 'Seats are locked in Redis for 480 seconds (8 minutes) using a distributed key. If payment is unverified before expiry, the lock dissolves automatically.';
      citation = 'Booking Service Spec · §2.4 (Seat Lock Lifecycles)';
    } else if (q.toLowerCase().includes('payout')) {
      replyText = 'Organizer balances are projected from immutable KurrentDB event streams. Payouts require an Idempotency-Key and are transferred within minutes.';
      citation = 'Ledger Service Spec · §1.2 (CQRS & Bank Payouts)';
    } else if (q.toLowerCase().includes('payment')) {
      replyText = 'Payments are captured through Razorpay. If an authorization fails, the hold is released immediately without charging your bank account.';
      citation = 'Payment Service Spec · §5.0 (Webhook Idempotency)';
    }

    const assistantMsg: SupportMessage = {
      id: 'msg-' + (Date.now() + 1),
      sender: 'assistant',
      text: replyText,
      citation,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
  };

  return (
    <section id="support-section" className="bg-[#0B0A08] text-[#EDE8DD] py-24 border-b border-hairline-dark paper-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <div className="font-mono text-xs uppercase tracking-widest text-[#FF4F1F] mb-3">
            VERIFIED RAG INTELLIGENCE
          </div>
          <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#EDE8DD]">
            Ask Ticksy: support that cites its sources
          </h2>
          <p className="mt-3 font-sans text-sm text-[#EDE8DD]/70">
            Answers are grounded directly in our architectural specifications and refund bylaws. No hallucinations, only verifiable facts.
          </p>
        </div>

        {/* Chat Visual Component */}
        <div className="max-w-3xl mx-auto border border-hairline-dark bg-[#12100D] rounded-[3px] shadow-2xl overflow-hidden flex flex-col">
          {/* Top Panel Bar */}
          <div className="p-4 border-b border-hairline-dark bg-[#161410] flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-[#EDE8DD]">TICKSY DOCS RAG ENGINE</span>
            </div>
            <div className="text-[#EDE8DD]/50">EMBEDDINGS: QDRANT · RS256 VERIFIED</div>
          </div>

          {/* Chat Messages */}
          <div className="p-6 space-y-6 min-h-[300px] max-h-[440px] overflow-y-auto">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-[2px] bg-[#EDE8DD]/10 border border-hairline-dark flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-[#FF4F1F]" />
                    </div>
                  )}

                  <div className={`max-w-xl space-y-2 ${isUser ? 'text-right' : 'text-left'}`}>
                    <div
                      className={`p-4 rounded-[2px] font-sans text-xs sm:text-sm leading-relaxed border ${
                        isUser
                          ? 'bg-[#1D1A15] text-[#EDE8DD] border-hairline-dark'
                          : 'bg-[#161410] text-[#EDE8DD]/90 border-hairline-dark'
                      }`}
                    >
                      {m.text}
                    </div>

                    {/* Signature Ground-Truth Citation Chip */}
                    {m.citation && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#B8975A]/15 border border-[#B8975A]/40 rounded-[2px] font-mono text-[11px] text-[#B8975A]">
                        <FileText className="w-3 h-3" />
                        <span>CITATION: {m.citation}</span>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-[2px] bg-[#FF4F1F]/20 border border-[#FF4F1F]/40 flex items-center justify-center shrink-0 mt-0.5">
                      <UserIcon className="w-4 h-4 text-[#FF4F1F]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Questions Strip */}
          <div className="px-6 py-2.5 border-t border-hairline-dark bg-[#14120E] flex items-center gap-2 overflow-x-auto text-xs font-mono">
            <span className="text-[#EDE8DD]/40 shrink-0">TRY:</span>
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSend(p)}
                className="shrink-0 px-2.5 py-1 bg-[#EDE8DD]/5 hover:bg-[#EDE8DD]/10 border border-hairline-dark text-[#EDE8DD]/70 hover:text-[#EDE8DD] rounded-[2px] transition-colors"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-hairline-dark bg-[#161410] flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about refunds, 8-minute holds, or ledger accounting..."
              className="flex-1 bg-[#0B0A08] border border-hairline-dark focus:border-[#FF4F1F] text-[#EDE8DD] px-4 py-2 text-xs font-sans rounded-[2px] outline-none transition-colors"
            />
            <button
              onClick={() => handleSend()}
              className="px-4 py-2 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-xs rounded-[2px] transition-colors flex items-center gap-1.5"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
