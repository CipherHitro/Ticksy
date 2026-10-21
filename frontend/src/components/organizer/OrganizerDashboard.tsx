import React, { useState, useEffect } from 'react';
import type { LedgerBalance, LedgerEntry } from '../../types';
import { formatINR } from '../../utils/formatters';
import { getLedgerBalance, getLedgerStatements, requestPayout, injectDevEvent } from '../../services/api';
import { X, RefreshCw, ArrowUpRight, ShieldCheck, Zap } from 'lucide-react';

interface OrganizerDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({
  isOpen,
  onClose,
}) => {
  const [balance, setBalance] = useState<LedgerBalance | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<string>('25000');
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);
  const [devStatus, setDevStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'statement' | 'events' | 'dev'>('statement');

  const refreshData = async () => {
    setLoading(true);
    const [balRes, stmtRes] = await Promise.all([
      getLedgerBalance(),
      getLedgerStatements(),
    ]);
    if (balRes.success && balRes.data) setBalance(balRes.data);
    if (stmtRes.success && stmtRes.data) setEntries(stmtRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  if (!isOpen) return null;


  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const rupees = parseInt(payoutAmount);
    if (isNaN(rupees) || rupees <= 0) return;

    setLoading(true);
    const res = await requestPayout(rupees * 100);
    setLoading(false);

    if (res.success && res.data) {
      setPayoutSuccess(`Payout request for ${formatINR(rupees * 100)} initiated (ID: ${res.data.payoutId})`);
      refreshData();
      setTimeout(() => setPayoutSuccess(null), 5000);
    }
  };

  const handleInject = async (type: 'BookingConfirmed' | 'BookingRefunded') => {
    setLoading(true);
    const amtMinor = type === 'BookingConfirmed' ? 299900 : 149900;
    const res = await injectDevEvent(type, amtMinor);
    setLoading(false);
    if (res.success) {
      setDevStatus(`Event ${type} emitted to ledger stream. CQRS read model re-projected.`);
      refreshData();
      setTimeout(() => setDevStatus(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-[#0B0A08] text-[#EDE8DD] rounded-[3px] border border-hairline-dark shadow-2xl p-6 sm:p-8 my-8 paper-grain">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 rounded-[2px] transition-colors"
        >
          <X className="w-5 h-5 text-[#EDE8DD]" />
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline-dark pb-6 mb-8">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#B8975A] font-bold mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#B8975A]" />
              <span>ORGANIZER LEDGER HUB · KURRENTDB CQRS</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-[#EDE8DD]">
              Financial Statement & Payouts
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 font-mono text-xs rounded-[2px] border border-hairline-dark transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </button>
          </div>
        </div>

        {/* Top Metric Cards in Brass & Bone */}
        {balance && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px]">
              <div className="font-mono text-[10px] uppercase text-[#EDE8DD]/50">AVAILABLE TO WITHDRAW</div>
              <div className="font-serif text-2xl sm:text-3xl font-bold text-[#B8975A] tabular-nums mt-1">
                {formatINR(balance.availableBalanceMinor)}
              </div>
              <div className="font-mono text-[10px] text-emerald-400 mt-1">● Ready for transfer</div>
            </div>

            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px]">
              <div className="font-mono text-[10px] uppercase text-[#EDE8DD]/50">GROSS TICKET SALES</div>
              <div className="font-serif text-2xl sm:text-3xl font-bold text-[#EDE8DD] tabular-nums mt-1">
                {formatINR(balance.grossSalesMinor)}
              </div>
              <div className="font-mono text-[10px] text-[#EDE8DD]/50 mt-1">Cumulative sales</div>
            </div>

            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px]">
              <div className="font-mono text-[10px] uppercase text-[#EDE8DD]/50">PLATFORM FEES (5%)</div>
              <div className="font-serif text-2xl sm:text-3xl font-bold text-[#EDE8DD]/80 tabular-nums mt-1">
                {formatINR(balance.platformFeesMinor)}
              </div>
              <div className="font-mono text-[10px] text-[#EDE8DD]/50 mt-1">Automated deduction</div>
            </div>

            <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px]">
              <div className="font-mono text-[10px] uppercase text-[#EDE8DD]/50">TOTAL DISBURSED</div>
              <div className="font-serif text-2xl sm:text-3xl font-bold text-[#EDE8DD]/80 tabular-nums mt-1">
                {formatINR(balance.payoutsMinor)}
              </div>
              <div className="font-mono text-[10px] text-[#EDE8DD]/50 mt-1">Bank settlements</div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {payoutSuccess && (
          <div className="mb-6 p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 font-mono text-xs rounded-[2px] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{payoutSuccess}</span>
          </div>
        )}

        {devStatus && (
          <div className="mb-6 p-3 bg-amber-950/40 border border-[#B8975A]/50 text-[#EDE8DD] font-mono text-xs rounded-[2px] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#B8975A] shrink-0" />
            <span>{devStatus}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-hairline-dark mb-6 font-mono text-xs">
          <button
            onClick={() => setActiveTab('statement')}
            className={`py-2 px-4 border-b-2 font-bold transition-colors ${
              activeTab === 'statement'
                ? 'border-[#B8975A] text-[#B8975A]'
                : 'border-transparent text-[#EDE8DD]/60 hover:text-[#EDE8DD]'
            }`}
          >
            Audit Statement ({entries.length} Rows)
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`py-2 px-4 border-b-2 font-bold transition-colors ${
              activeTab === 'events'
                ? 'border-[#B8975A] text-[#B8975A]'
                : 'border-transparent text-[#EDE8DD]/60 hover:text-[#EDE8DD]'
            }`}
          >
            Request Payout
          </button>
          <button
            onClick={() => setActiveTab('dev')}
            className={`py-2 px-4 border-b-2 font-bold transition-colors ${
              activeTab === 'dev'
                ? 'border-[#FF4F1F] text-[#FF4F1F]'
                : 'border-transparent text-[#EDE8DD]/60 hover:text-[#EDE8DD]'
            }`}
          >
            Dev Event Injector
          </button>
        </div>

        {/* Tab 1: Audit Statement */}
        {activeTab === 'statement' && (
          <div className="bg-[#12100D] border border-hairline-dark rounded-[2px] p-4 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline-dark text-[#EDE8DD]/50 text-[10px] uppercase">
                  <th className="py-2.5 pr-4">TIMESTAMP</th>
                  <th className="py-2.5 pr-4">TRANSACTION ENTRY</th>
                  <th className="py-2.5 pr-4">REFERENCE ID</th>
                  <th className="py-2.5 pr-4 text-right">AMOUNT (₹)</th>
                  <th className="py-2.5 text-right">RUNNING BALANCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-dark/60">
                {entries.map((item) => {
                  const isNeg = item.amountMinor < 0;
                  return (
                    <tr key={item.id} className="hover:bg-[#EDE8DD]/5 transition-colors">
                      <td className="py-3 pr-4 text-[#EDE8DD]/60 whitespace-nowrap">{item.timestamp}</td>
                      <td className="py-3 pr-4 text-[#EDE8DD] font-medium">{item.description}</td>
                      <td className="py-3 pr-4 text-[#EDE8DD]/50 text-[11px]">{item.referenceId}</td>
                      <td className={`py-3 pr-4 text-right tabular-nums font-semibold whitespace-nowrap ${
                        isNeg ? 'text-[#FF4F1F]' : 'text-emerald-400'
                      }`}>
                        {formatINR(item.amountMinor)}
                      </td>
                      <td className="py-3 text-right tabular-nums font-semibold text-[#B8975A] whitespace-nowrap">
                        {formatINR(item.runningBalanceMinor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Payout Request Form */}
        {activeTab === 'events' && (
          <div className="max-w-xl mx-auto p-6 bg-[#12100D] border border-hairline-dark rounded-[2px] space-y-6">
            <div>
              <h3 className="font-serif text-2xl text-[#EDE8DD]">
                Withdraw to Bank Account
              </h3>
              <p className="font-sans text-xs text-[#EDE8DD]/60 mt-1">
                Disbursements are signed with an Idempotency-Key header to prevent duplicate settlement transfers.
              </p>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] uppercase text-[#EDE8DD]/60 mb-1">
                  PAYOUT AMOUNT (RUPEES)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-[#B8975A] font-bold">₹</span>
                  <input
                    type="number"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-full bg-[#181612] border border-hairline-dark focus:border-[#B8975A] text-[#EDE8DD] pl-8 pr-3 py-2 text-sm rounded-[2px] outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#181612] border border-hairline-dark rounded-[2px] space-y-1 text-[11px] text-[#EDE8DD]/70">
                <div className="flex justify-between">
                  <span>Registered Bank:</span>
                  <span className="text-[#EDE8DD] font-semibold">HDFC Bank Limited</span>
                </div>
                <div className="flex justify-between">
                  <span>Account Number:</span>
                  <span className="text-[#EDE8DD] font-semibold">•••• •••• 8812</span>
                </div>
                <div className="flex justify-between">
                  <span>IFSC:</span>
                  <span className="text-[#EDE8DD] font-semibold">HDFC0001248</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#B8975A] hover:bg-[#A38349] text-white font-bold rounded-[2px] transition-colors flex items-center justify-center gap-2"
              >
                <span>{loading ? 'Processing via Ledger...' : `Initiate Bank Payout (₹${payoutAmount})`}</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Dev Event Injector */}
        {activeTab === 'dev' && (
          <div className="p-6 bg-[#14120E] border border-[#FF4F1F]/30 rounded-[2px] space-y-6">
            <div className="flex items-center gap-2 font-mono text-xs uppercase text-[#FF4F1F] font-bold">
              <Zap className="w-4 h-4" />
              <span>MICROSERVICE TESTING & ARCHITECTURE EVALUATION</span>
            </div>
            <p className="font-sans text-xs text-[#EDE8DD]/70">
              The Ledger Service exposes a <code>POST /api/v1/ledger/dev/events</code> endpoint. Use these buttons to simulate domain events from the Booking or Payment microservices and verify that KurrentDB reconstitutes the state and Redis read models update:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
              <button
                onClick={() => handleInject('BookingConfirmed')}
                disabled={loading}
                className="p-4 bg-[#181612] hover:bg-[#201D17] border border-emerald-500/40 rounded-[2px] text-left transition-colors"
              >
                <div className="font-bold text-emerald-400 flex items-center justify-between mb-1">
                  <span>Inject BookingConfirmed</span>
                  <span>+₹2,999</span>
                </div>
                <div className="text-[11px] text-[#EDE8DD]/60">
                  Simulates successful checkout saga. Credited to gross sales with 5% platform fee deducted.
                </div>
              </button>

              <button
                onClick={() => handleInject('BookingRefunded')}
                disabled={loading}
                className="p-4 bg-[#181612] hover:bg-[#201D17] border border-red-500/40 rounded-[2px] text-left transition-colors"
              >
                <div className="font-bold text-red-400 flex items-center justify-between mb-1">
                  <span>Inject BookingRefunded</span>
                  <span>−₹1,499</span>
                </div>
                <div className="text-[11px] text-[#EDE8DD]/60">
                  Simulates attendee cancellation. Reversal posted to the immutable ledger stream.
                </div>
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-hairline-dark flex items-center justify-between font-mono text-[11px] text-[#EDE8DD]/50">
          <span>EVENT SOURCING: KURRENTDB (FORMERLY EVENTSTOREDB)</span>
          <span>CQRS READ MODELS: REDIS PROJECTIONS</span>
        </div>
      </div>
    </div>
  );
};
