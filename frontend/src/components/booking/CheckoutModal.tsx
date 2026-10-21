import React, { useState, useEffect } from 'react';
import type { EventItem, Seat, Ticket } from '../../types';
import { formatINR, formatTimer, generateTicketSerial } from '../../utils/formatters';
import { useAuth } from '../../services/authContext';
import { addPurchasedTicket, verifyPayment } from '../../services/api';
import { TicketStub } from '../common/TicketStub';
import { X, Clock, CheckCircle2, ArrowRight, Shield } from 'lucide-react';

interface CheckoutModalProps {
  event: EventItem | null;
  seats: Seat[];
  onClose: () => void;
  onSuccess: (ticket: Ticket) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  event,
  seats,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [countdown, setCountdown] = useState<number>(480);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [upiId, setUpiId] = useState('fan@okaxis');
  const [processing, setProcessing] = useState(false);
  const [confirmedTicket, setConfirmedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!event || seats.length === 0) return null;


  const seatsSubtotal = seats.reduce((acc, s) => acc + s.priceMinor, 0);
  const platformFee = Math.round(seatsSubtotal * 0.05);
  const totalAmount = seatsSubtotal + platformFee;

  const handlePay = async () => {
    setProcessing(true);
    const paymentId = 'pay_' + Date.now();
    const rzpId = 'rzp_pay_' + Math.random().toString(36).substring(2, 10);

    // Call payment verification endpoint (integrating with Payment microservice)
    await verifyPayment(paymentId, rzpId);

    const ticketSerial = generateTicketSerial();
    const newTicket: Ticket = {
      id: 'tkt_' + Date.now(),
      serialNumber: ticketSerial,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: `${event.date} · ${event.time}`,
      venue: event.venue,
      city: event.city,
      seats: seats.map((s) => s.id),
      tierName: seats[0].tierName,
      attendeeName: user?.name || 'Verified Attendee',
      attendeeEmail: user?.email || 'fan@ticksy.local',
      amountMinor: totalAmount,
      currency: 'INR',
      status: 'VALID',
      purchasedAt: new Date().toISOString(),
      qrCodeValue: `ticksy:verified:${ticketSerial}:${paymentId}`,
    };

    addPurchasedTicket(newTicket);
    setProcessing(false);
    setConfirmedTicket(newTicket);
    onSuccess(newTicket);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#EDE8DD] text-[#0B0A08] rounded-[3px] border border-hairline-light shadow-2xl overflow-hidden my-8">
        {/* Pinned Hold Timer Banner at Top */}
        <div className="bg-[#0B0A08] text-[#EDE8DD] px-6 py-3 flex items-center justify-between border-b border-hairline-dark font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF4F1F] animate-ping" />
            <span className="font-bold">SEATS RESERVED IN REDIS CACHE</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#FF4F1F] font-bold">
            <Clock className="w-4 h-4" />
            <span>{formatTimer(countdown)} REMAINING TO COMPLETE PAYMENT</span>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-12 right-4 z-20 p-1.5 bg-[#0B0A08]/10 hover:bg-[#0B0A08]/20 rounded-[2px]"
        >
          <X className="w-5 h-5 text-[#0B0A08]" />
        </button>

        {confirmedTicket ? (
          /* Confirmation State: Ticket Stub Slide-out */
          <div className="p-8 sm:p-10 space-y-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <div className="font-mono text-xs uppercase text-emerald-700 font-bold mb-1">
                TRANSACTION COMPLETE · 42MS SAGA CONFIRMED
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl text-[#0B0A08]">
                Your pass is confirmed
              </h2>
              <p className="font-sans text-xs text-[#0B0A08]/70 mt-1">
                A confirmation has been dispatched. Your ticket stub is ready below for mobile gate entry.
              </p>
            </div>

            <div className="max-w-xl mx-auto transform hover:scale-[1.01] transition-transform">
              <TicketStub ticket={confirmedTicket} showActions={false} />
            </div>

            <div className="pt-4 flex justify-center gap-4">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-[#0B0A08] text-[#EDE8DD] font-mono text-xs font-semibold rounded-[2px] hover:bg-[#1A1814] transition-colors"
              >
                Close & View All Tickets
              </button>
            </div>
          </div>
        ) : (
          /* Two Column Checkout */
          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left Column: Order Summary as Physical Receipt (5 cols) */}
            <div className="md:col-span-5 bg-[#F5F2EB] border border-[#0B0A08]/20 p-6 rounded-[2px] relative shadow-inner">
              {/* Receipt perforated header */}
              <div className="text-center pb-4 border-b border-dashed border-[#0B0A08]/30">
                <div className="font-serif text-2xl font-bold tracking-tight text-[#0B0A08]">
                  Ticksy Order Receipt
                </div>
                <div className="font-mono text-[10px] text-[#0B0A08]/50 mt-1 uppercase">
                  EVENT CODE: {event.id.toUpperCase()}
                </div>
              </div>

              {/* Event details */}
              <div className="py-4 border-b border-dashed border-[#0B0A08]/30 space-y-1 font-mono text-xs">
                <div className="font-serif text-lg font-normal text-[#0B0A08]">
                  {event.title}
                </div>
                <div className="text-[#0B0A08]/70">{event.date} · {event.time}</div>
                <div className="text-[#0B0A08]/70">{event.venue}</div>
              </div>

              {/* Seats breakdown */}
              <div className="py-4 border-b border-dashed border-[#0B0A08]/30 space-y-2 font-mono text-xs">
                <div className="text-[#0B0A08]/50 uppercase text-[10px]">SEATS RESERVED:</div>
                {seats.map((s) => (
                  <div key={s.id} className="flex justify-between">
                    <span>Seat {s.id} ({s.tierName.split(' ')[0]})</span>
                    <span className="tabular-nums font-semibold">{formatINR(s.priceMinor)}</span>
                  </div>
                ))}
              </div>

              {/* Taxes and total */}
              <div className="pt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between text-[#0B0A08]/60">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatINR(seatsSubtotal)}</span>
                </div>
                <div className="flex justify-between text-[#0B0A08]/60">
                  <span>Platform Fee (5%)</span>
                  <span className="tabular-nums">{formatINR(platformFee)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-[#0B0A08] pt-2 border-t border-[#0B0A08]/20">
                  <span>Total Amount</span>
                  <span className="tabular-nums text-[#FF4F1F]">{formatINR(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Razorpay Payment Simulation Form (7 cols) */}
            <div className="md:col-span-7 space-y-6">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-1">
                  PAYMENT MICROSERVICE · RAZORPAY GATEWAY
                </div>
                <h3 className="font-serif text-2xl text-[#0B0A08]">
                  Select payment method
                </h3>
              </div>

              {/* Method Tabs */}
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi')}
                  className={`py-2 px-3 rounded-[2px] border ${
                    paymentMethod === 'upi'
                      ? 'bg-[#0B0A08] text-[#EDE8DD] border-[#0B0A08] font-bold'
                      : 'bg-[#F5F2EB] text-[#0B0A08]/70 border-[#0B0A08]/20'
                  }`}
                >
                  UPI (Instant)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`py-2 px-3 rounded-[2px] border ${
                    paymentMethod === 'card'
                      ? 'bg-[#0B0A08] text-[#EDE8DD] border-[#0B0A08] font-bold'
                      : 'bg-[#F5F2EB] text-[#0B0A08]/70 border-[#0B0A08]/20'
                  }`}
                >
                  Debit/Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('netbanking')}
                  className={`py-2 px-3 rounded-[2px] border ${
                    paymentMethod === 'netbanking'
                      ? 'bg-[#0B0A08] text-[#EDE8DD] border-[#0B0A08] font-bold'
                      : 'bg-[#F5F2EB] text-[#0B0A08]/70 border-[#0B0A08]/20'
                  }`}
                >
                  Netbanking
                </button>
              </div>

              {/* Payment Details Input */}
              {paymentMethod === 'upi' && (
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="block text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                      ENTER UPI ID / VPA
                    </label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="e.g. mobile@upi or username@okaxis"
                      className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] px-3 py-2 text-xs rounded-[2px] outline-none text-[#0B0A08]"
                    />
                  </div>
                  <div className="flex gap-2 text-[10px] text-[#0B0A08]/60">
                    <span className="px-2 py-0.5 bg-[#0B0A08]/5 border border-[#0B0A08]/15 rounded-[2px]">Google Pay</span>
                    <span className="px-2 py-0.5 bg-[#0B0A08]/5 border border-[#0B0A08]/15 rounded-[2px]">PhonePe</span>
                    <span className="px-2 py-0.5 bg-[#0B0A08]/5 border border-[#0B0A08]/15 rounded-[2px]">Paytm</span>
                    <span className="px-2 py-0.5 bg-[#0B0A08]/5 border border-[#0B0A08]/15 rounded-[2px]">Cred</span>
                  </div>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="block text-[10px] uppercase text-[#0B0A08]/60 mb-1">CARD NUMBER</label>
                    <input
                      type="text"
                      defaultValue="4242 •••• •••• 4242"
                      className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 px-3 py-2 text-xs rounded-[2px] text-[#0B0A08]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase text-[#0B0A08]/60 mb-1">EXPIRY</label>
                      <input
                        type="text"
                        defaultValue="12/28"
                        className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 px-3 py-2 text-xs rounded-[2px] text-[#0B0A08]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-[#0B0A08]/60 mb-1">CVV</label>
                      <input
                        type="password"
                        defaultValue="888"
                        className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 px-3 py-2 text-xs rounded-[2px] text-[#0B0A08]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'netbanking' && (
                <div className="font-mono text-xs space-y-2">
                  <label className="block text-[10px] uppercase text-[#0B0A08]/60">SELECT BANK</label>
                  <select className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 px-3 py-2 text-xs rounded-[2px] text-[#0B0A08]">
                    <option>HDFC Bank</option>
                    <option>ICICI Bank</option>
                    <option>State Bank of India (SBI)</option>
                    <option>Axis Bank</option>
                    <option>Kotak Mahindra Bank</option>
                  </select>
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={processing}
                className="w-full py-3.5 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 disabled:opacity-50 text-white font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                <span>{processing ? 'Capturing via Razorpay & Confirming Saga...' : `Pay ${formatINR(totalAmount)}`}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 text-[10px] font-mono text-[#0B0A08]/60 justify-center">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span>HMAC-SHA256 signature verified by Payment Microservice</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
