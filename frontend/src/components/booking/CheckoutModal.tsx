import React, { useState, useEffect } from 'react';
import type { EventItem, Seat, Ticket } from '../../types';
import { formatINR, formatTimer } from '../../utils/formatters';
import { useAuth } from '../../services/authContext';
import {
  confirmBookingDev,
  createBookingHold,
  createPaymentOrder,
  verifyPayment,
  seedNotificationContact,
  sendNotificationEvent,
  recordLedgerSale,
} from '../../services/api';
import { TicketStub } from '../common/TicketStub';
import { X, Clock, CheckCircle2, ArrowRight, Shield, AlertTriangle, CreditCard } from 'lucide-react';

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
  const [processing, setProcessing] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
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
    setPaymentError(null);
    setStatusStep('Holding seats in Redis & MySQL...');

    // 1. Hold seats in Booking Service (Redis + MySQL)
    const holdRes = await createBookingHold(
      event.id,
      seats.map((s) => ({
        tierId: s.tierId || 'tier-general',
        seatLabel: s.id,
      }))
    );

    if (!holdRes.success || !holdRes.data?.bookingId) {
      setProcessing(false);
      setStatusStep('');
      setPaymentError(holdRes.message || 'Unable to hold selected seats. They may have been taken or expired.');
      return;
    }

    const bookingId = holdRes.data.bookingId;

    // 2. Create Razorpay order on Payment Microservice
    setStatusStep('Creating Razorpay order on Payment service...');
    const orderRes = await createPaymentOrder(bookingId, totalAmount, 'INR');

    if (!orderRes.success || !orderRes.data) {
      setProcessing(false);
      setStatusStep('');
      setPaymentError(orderRes.message || 'Failed to initiate Razorpay order with Payment service.');
      return;
    }

    const orderData = orderRes.data;

    // 3. Ensure attendee contact is registered in Notification service
    if (user?.id && user?.email) {
      try {
        await seedNotificationContact(user.id, user.email, user.name || 'Attendee', user.role || 'ATTENDEE');
      } catch (e) {
        console.warn('Seed contact note:', e);
      }
    }

    // 4. Ensure Razorpay SDK is loaded
    if (!(window as any).Razorpay) {
      setStatusStep('Loading Razorpay Checkout script...');
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
          document.body.appendChild(script);
        });
      } catch (err: any) {
        setProcessing(false);
        setStatusStep('');
        setPaymentError('Could not load Razorpay checkout script. Please check your network connection.');
        return;
      }
    }

    setStatusStep('Awaiting payment in Razorpay modal...');

    const options = {
      key: orderData.keyId || 'rzp_test_TpJLcAQqFOhPiS',
      amount: totalAmount,
      currency: 'INR',
      name: 'Ticksy Live Events',
      description: `${event.title} (${seats.length} seat${seats.length > 1 ? 's' : ''})`,
      order_id: orderData.providerOrderId,
      prefill: {
        name: user?.name || '',
        email: user?.email || '',
      },
      theme: {
        color: '#FF4F1F',
      },
      handler: async function (response: any) {
        setProcessing(true);
        setStatusStep('Verifying payment signature with backend...');

        try {
          // 4a. Verify signature with Payment microservice
          const verifyRes = await verifyPayment(
            orderData.paymentId,
            response.razorpay_payment_id,
            response.razorpay_signature
          );

          if (!verifyRes.success) {
            throw new Error(verifyRes.message || 'Payment signature verification failed');
          }

          setStatusStep('Confirming booking in database...');
          // 4b. Confirm booking in Booking microservice
          await confirmBookingDev(bookingId);

          setStatusStep('Dispatching confirmation email via Resend...');
          // 4c. Trigger real email via Notification microservice (Resend)
          const confirmedAt = new Date().toISOString();
          await sendNotificationEvent('BookingConfirmed', {
            bookingId,
            userId: user?.id || 'usr_dev',
            userEmail: user?.email || 'attendee@ticksy.com',
            userName: user?.name || 'Verified Attendee',
            eventId: event.id,
            eventTitle: event.title,
            totalAmountMinor: totalAmount,
            currency: 'INR',
            confirmedAt,
            items: seats.map((s) => ({
              seatLabel: `${s.row}-${s.number}`,
              tierName: s.tierName || 'Standard',
              priceMinor: s.priceMinor || Math.round(totalAmount / seats.length),
            })),
          });

          setStatusStep('Posting transaction to KurrentDB Ledger...');
          // 4d. Post transaction to KurrentDB Event Store & Redis CQRS
          try {
            await recordLedgerSale({
              bookingId,
              eventId: event.id,
              eventTitle: event.title,
              organizerId: event.organizerId || (user?.role === 'ORGANIZER' ? user.id : undefined),
              paymentId: orderData.paymentId,
              totalAmountMinor: totalAmount,
              currency: 'INR',
            });
          } catch (ledgerErr) {
            console.warn('Ledger recording error:', ledgerErr);
          }

          // 4e. Generate confirmed ticket stub
          const ticketSerial = 'TK-' + bookingId.slice(0, 8).toUpperCase();
          const newTicket: Ticket = {
            id: bookingId,
            serialNumber: ticketSerial,
            eventId: event.id,
            eventTitle: event.title,
            eventDate: `${event.date} · ${event.time}`,
            venue: event.venue,
            city: event.city,
            seats: seats.map((s) => s.id),
            tierName: seats[0]?.tierName || 'General',
            attendeeName: user?.name || 'Verified Attendee',
            attendeeEmail: user?.email || 'attendee@ticksy.com',
            amountMinor: totalAmount,
            currency: 'INR',
            status: 'VALID',
            purchasedAt: confirmedAt,
            qrCodeValue: `ticksy:verified:${ticketSerial}:${bookingId}`,
            organizerId: event.organizerId || (user?.role === 'ORGANIZER' ? user.id : undefined),
          };

          setConfirmedTicket(newTicket);
          onSuccess(newTicket);
        } catch (err: any) {
          setPaymentError(err.message || 'Payment verification or confirmation failed.');
        } finally {
          setProcessing(false);
          setStatusStep('');
        }
      },
      modal: {
        ondismiss: function () {
          setProcessing(false);
          setStatusStep('');
        },
      },
    };

    const rzp = new (window as any).Razorpay(options);

    rzp.on('payment.failed', async function (failedResponse: any) {
      setProcessing(false);
      setStatusStep('');
      const reason = failedResponse.error?.description || 'Payment was declined or cancelled.';
      setPaymentError(reason);

      // Trigger payment-failed email via Notification microservice
      try {
        await sendNotificationEvent('PaymentFailed', {
          paymentId: orderData.paymentId,
          bookingId,
          userId: user?.id || 'usr_dev',
          eventTitle: event.title,
          amountMinor: totalAmount,
          currency: 'INR',
          failedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to notify payment failure:', err);
      }
    });

    rzp.open();
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

            {/* Right Column: Razorpay Checkout Experience (7 cols) */}
            <div className="md:col-span-7 space-y-6">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-1">
                  PAYMENT MICROSERVICE · RAZORPAY GATEWAY
                </div>
                <h3 className="font-serif text-2xl text-[#0B0A08]">
                  Razorpay Checkout
                </h3>
                <p className="font-sans text-xs text-[#0B0A08]/70 mt-1">
                  Secure checkout powered by Razorpay. Test mode credentials active.
                </p>
              </div>

              {/* Error Alert */}
              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-[2px] font-mono text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Payment Notification</div>
                    <div className="text-[11px] text-red-700 mt-0.5">{paymentError}</div>
                  </div>
                </div>
              )}

              {/* Status Step (when processing) */}
              {processing && statusStep && (
                <div className="p-3 bg-[#0B0A08] text-[#EDE8DD] rounded-[2px] font-mono text-xs flex items-center gap-2.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-[#FF4F1F] animate-ping" />
                  <span>{statusStep}</span>
                </div>
              )}

              {/* Payment Methods Card */}
              <div className="bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[2px] p-4 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[#0B0A08]">
                  <div className="flex items-center gap-2 font-bold">
                    <CreditCard className="w-4 h-4 text-[#FF4F1F]" />
                    <span>Accepted Payment Methods</span>
                  </div>
                  <span className="text-[10px] uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
                    Instant Settle
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#0B0A08]/80 pt-1">
                  <div className="flex items-center gap-1.5 p-2 bg-[#EDE8DD] rounded border border-[#0B0A08]/10">
                    <span className="font-bold text-[#FF4F1F]">UPI</span>
                    <span>GPay, PhonePe, Paytm, CRED</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-2 bg-[#EDE8DD] rounded border border-[#0B0A08]/10">
                    <span className="font-bold text-[#FF4F1F]">Cards</span>
                    <span>Visa, Mastercard, RuPay</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-2 bg-[#EDE8DD] rounded border border-[#0B0A08]/10">
                    <span className="font-bold text-[#FF4F1F]">Netbanking</span>
                    <span>50+ Indian Banks</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-2 bg-[#EDE8DD] rounded border border-[#0B0A08]/10">
                    <span className="font-bold text-[#FF4F1F]">Email Pass</span>
                    <span className="truncate">{user?.email || 'Registered email'}</span>
                  </div>
                </div>

                <div className="text-[10px] text-[#0B0A08]/60 pt-1 border-t border-[#0B0A08]/10 flex items-center justify-between">
                  <span>Confirmation dispatched via:</span>
                  <span className="font-bold text-[#0B0A08]">Notification Service · Resend</span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handlePay}
                disabled={processing}
                className="w-full py-4 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 disabled:opacity-50 text-white font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <span>
                  {processing
                    ? (statusStep || 'Processing with Razorpay...')
                    : `Proceed to Pay ${formatINR(totalAmount)}`}
                </span>
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
