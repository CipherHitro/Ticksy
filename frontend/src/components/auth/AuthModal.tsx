import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { TicketStub } from '../common/TicketStub';
import { INITIAL_MY_TICKETS } from '../../data/mockData';
import { X, ArrowRight, ShieldCheck } from 'lucide-react';
import type { UserRole } from '../../types';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, authModalMode, login, register, quickLogin, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(authModalMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('ATTENDEE');
  const [error, setError] = useState<string | null>(null);
  const [otpMode, setOtpMode] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otpMode) {
      // Complete OTP flow
      await quickLogin(role);
      closeAuthModal();
      return;
    }

    if (mode === 'login') {
      if (!email || !password) {
        setError('Please enter both email and password');
        return;
      }
      const res = await login(email, password);
      if (!res.success) {
        setError(res.message || 'Invalid credentials');
      }
    } else {
      if (!name || !email || !password) {
        setError('Please complete all fields');
        return;
      }
      const res = await register(name, email, password, role);
      if (!res.success) {
        setError(res.message || 'Registration failed');
      }
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val.slice(-1);
    const updated = [...otpDigits];
    updated[index] = val;
    setOtpDigits(updated);

    // Auto-focus next input
    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
      {/* Outer Modal Container with Split Screen */}
      <div className="relative w-full max-w-4xl bg-[#EDE8DD] rounded-[3px] border border-hairline-light shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[540px]">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 z-20 p-1.5 rounded-[2px] bg-[#0B0A08]/10 hover:bg-[#0B0A08]/20 text-[#0B0A08] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Panel: 45% on Bone */}
        <div className="w-full md:w-[48%] p-8 sm:p-10 flex flex-col justify-between bg-[#EDE8DD] text-[#0B0A08]">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-2">
              IDENTITY & ACCESS
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-[#0B0A08] mb-1">
              {otpMode ? 'Enter verification code' : mode === 'login' ? 'Welcome to Ticksy' : 'Create an account'}
            </h2>
            <p className="font-sans text-xs text-[#0B0A08]/70 mb-6">
              {otpMode
                ? 'We sent a 6-digit one-time pass to your email.'
                : mode === 'login'
                ? 'Sign in to access your held seats, tickets, or organizer ledger.'
                : 'Join fans and curators on an audited ticketing protocol.'}
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-red-100 border border-red-300 text-red-700 text-xs font-mono rounded-[2px]">
                {error}
              </div>
            )}

            {/* Quick Demo Login Shortcut Buttons */}
            <div className="mb-6 p-3 bg-[#0B0A08]/5 border border-[#0B0A08]/15 rounded-[2px]">
              <div className="font-mono text-[10px] uppercase text-[#0B0A08]/50 mb-2 font-bold">
                1-CLICK EVALUATION LOGINS
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => quickLogin('ATTENDEE')}
                  className="py-1.5 px-2 bg-[#0B0A08] text-[#EDE8DD] hover:bg-[#1A1814] rounded-[2px] text-center"
                >
                  Attendee
                </button>
                <button
                  type="button"
                  onClick={() => quickLogin('ORGANIZER')}
                  className="py-1.5 px-2 bg-[#B8975A] text-white hover:bg-[#A38349] rounded-[2px] text-center font-bold"
                >
                  Organizer
                </button>
                <button
                  type="button"
                  onClick={() => quickLogin('ADMIN')}
                  className="py-1.5 px-2 bg-emerald-700 text-white hover:bg-emerald-800 rounded-[2px] text-center"
                >
                  Admin
                </button>
              </div>
            </div>

            {/* Main Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {otpMode ? (
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0B0A08]/60 mb-2">
                    6-DIGIT CODE
                  </label>
                  <div className="flex gap-2 justify-between">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`otp-${idx}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        className="w-10 h-12 text-center font-mono text-lg font-bold bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] rounded-[2px] outline-none text-[#0B0A08]"
                      />
                    ))}
                  </div>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOtpMode(false)}
                      className="font-mono text-[11px] text-[#0B0A08]/60 hover:text-[#0B0A08]"
                    >
                      Use password instead
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {mode === 'register' && (
                    <div>
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0B0A08]/60 mb-1">
                        FULL NAME
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Aarav Sharma"
                        className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs font-sans rounded-[2px] outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0B0A08]/60 mb-1">
                      EMAIL ADDRESS
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs font-sans rounded-[2px] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0B0A08]/60 mb-1">
                      PASSWORD
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs font-sans rounded-[2px] outline-none"
                    />
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0B0A08]/60 mb-1">
                        ACCOUNT TYPE
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRole('ATTENDEE')}
                          className={`py-1.5 px-3 text-xs font-mono rounded-[2px] border ${
                            role === 'ATTENDEE'
                              ? 'bg-[#0B0A08] text-white border-[#0B0A08]'
                              : 'bg-transparent text-[#0B0A08]/70 border-[#0B0A08]/20'
                          }`}
                        >
                          Fan / Attendee
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole('ORGANIZER')}
                          className={`py-1.5 px-3 text-xs font-mono rounded-[2px] border ${
                            role === 'ORGANIZER'
                              ? 'bg-[#B8975A] text-white border-[#B8975A]'
                              : 'bg-transparent text-[#0B0A08]/70 border-[#0B0A08]/20'
                          }`}
                        >
                          Event Organizer
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <span>{loading ? 'Authenticating...' : otpMode ? 'Confirm & Enter' : mode === 'login' ? 'Sign in' : 'Create Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-[#0B0A08]/15 flex items-center justify-between text-xs font-mono">
            {mode === 'login' ? (
              <>
                <span className="text-[#0B0A08]/60">Don't have an account?</span>
                <button
                  onClick={() => { setMode('register'); setError(null); }}
                  className="font-bold text-[#0B0A08] hover:text-[#FF4F1F]"
                >
                  Register here
                </button>
              </>
            ) : (
              <>
                <span className="text-[#0B0A08]/60">Already registered?</span>
                <button
                  onClick={() => { setMode('login'); setError(null); }}
                  className="font-bold text-[#0B0A08] hover:text-[#FF4F1F]"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Panel: 52% on Ink with seat grid & physical stub */}
        <div className="w-full md:w-[52%] bg-[#0B0A08] text-[#EDE8DD] p-8 sm:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-hairline-dark paper-grain relative">
          <div>
            <div className="flex items-center justify-between font-mono text-xs text-[#EDE8DD]/50 border-b border-hairline-dark pb-3 mb-6">
              <span>ASSET VERIFICATION</span>
              <span className="text-[#FF4F1F]">GATE PROTOCOL</span>
            </div>

            <div className="transform scale-90 sm:scale-95 origin-top mb-4">
              <TicketStub ticket={INITIAL_MY_TICKETS[0]} showActions={false} />
            </div>
          </div>

          <div className="pt-4 border-t border-hairline-dark space-y-2 font-mono text-xs text-[#EDE8DD]/60">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>RS256 Asymmetric Signed Tokens</span>
            </div>
            <p className="font-sans text-[11px] text-[#EDE8DD]/40">
              Tokens issued with 15-minute expiry and verified via JWKS. Passwords securely hashed with bcrypt cost factor 12.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
