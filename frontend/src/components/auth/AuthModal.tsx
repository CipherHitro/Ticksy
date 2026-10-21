import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { X, ArrowRight, ShieldCheck, UserCheck, Calendar, Lock } from 'lucide-react';
import type { UserRole } from '../../types';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, authModalMode, login, register, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(authModalMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('ATTENDEE');
  const [error, setError] = useState<string | null>(null);

  // Sync mode with trigger
  React.useEffect(() => {
    setMode(authModalMode);
    setError(null);
  }, [authModalMode, isAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      if (!email || !password) {
        setError('Please enter both email and password');
        return;
      }
      const res = await login(email, password);
      if (!res.success) {
        setError(res.message || 'Invalid email or password');
      }
    } else {
      if (!name || !email || !password) {
        setError('Please complete all fields');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      const res = await register(name, email, password, role);
      if (!res.success) {
        setError(res.message || 'Registration failed');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-[#EDE8DD] rounded-[3px] border border-hairline-light shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[460px]">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 z-20 p-1.5 rounded-[2px] bg-[#0B0A08]/10 hover:bg-[#0B0A08]/20 text-[#0B0A08] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Panel: Form */}
        <div className="w-full md:w-[55%] p-8 sm:p-10 flex flex-col justify-between bg-[#EDE8DD] text-[#0B0A08]">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-2">
              ACCOUNT ACCESS
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-[#0B0A08] mb-1">
              {mode === 'login' ? 'Sign in to Ticksy' : 'Create an account'}
            </h2>
            <p className="font-sans text-xs text-[#0B0A08]/70 mb-6">
              {mode === 'login'
                ? 'Sign in to view your tickets or access your organizer portal.'
                : 'Join Ticksy to book live event seats or publish your own events.'}
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-red-100 border border-red-300 text-red-700 text-xs font-mono rounded-[2px]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="e.g. Rohit Sharma"
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
                  placeholder="you@example.com"
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
                    ROLE / ACCOUNT TYPE
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('ATTENDEE')}
                      className={`py-2 px-3 text-xs font-mono rounded-[2px] border flex items-center justify-center gap-1.5 ${
                        role === 'ATTENDEE'
                          ? 'bg-[#0B0A08] text-white border-[#0B0A08] font-bold'
                          : 'bg-transparent text-[#0B0A08]/70 border-[#0B0A08]/20'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Attendee / Fan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('ORGANIZER')}
                      className={`py-2 px-3 text-xs font-mono rounded-[2px] border flex items-center justify-center gap-1.5 ${
                        role === 'ORGANIZER'
                          ? 'bg-[#B8975A] text-white border-[#B8975A] font-bold'
                          : 'bg-transparent text-[#0B0A08]/70 border-[#0B0A08]/20'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Event Organizer</span>
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <span>{loading ? 'Processing...' : mode === 'login' ? 'Sign in' : 'Create Account'}</span>
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
                  Register here →
                </button>
              </>
            ) : (
              <>
                <span className="text-[#0B0A08]/60">Already have an account?</span>
                <button
                  onClick={() => { setMode('login'); setError(null); }}
                  className="font-bold text-[#0B0A08] hover:text-[#FF4F1F]"
                >
                  Sign in here →
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Role Privileges & Security */}
        <div className="w-full md:w-[45%] bg-[#0B0A08] text-[#EDE8DD] p-8 sm:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-hairline-dark paper-grain">
          <div>
            <div className="flex items-center justify-between font-mono text-xs text-[#EDE8DD]/50 border-b border-hairline-dark pb-3 mb-6">
              <span>ROLE PERMISSIONS</span>
              <span className="text-[#FF4F1F]">TICKSY AUTH</span>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 bg-[#EDE8DD]/5 border border-hairline-dark rounded-[2px]">
                <div className="flex items-center gap-2 font-mono text-xs text-[#EDE8DD] font-semibold mb-1">
                  <UserCheck className="w-4 h-4 text-[#FF4F1F]" />
                  <span>ATTENDEE ACCOUNT</span>
                </div>
                <p className="font-sans text-xs text-[#EDE8DD]/60 leading-relaxed">
                  Browse live published events, select real seats, complete instant payments, and manage your booked ticket passes.
                </p>
              </div>

              <div className="p-3.5 bg-[#EDE8DD]/5 border border-[#B8975A]/30 rounded-[2px]">
                <div className="flex items-center gap-2 font-mono text-xs text-[#B8975A] font-semibold mb-1">
                  <Calendar className="w-4 h-4 text-[#B8975A]" />
                  <span>ORGANIZER ACCOUNT</span>
                </div>
                <p className="font-sans text-xs text-[#EDE8DD]/60 leading-relaxed">
                  Publish events to the Catalog, configure ticket tiers and pricing, and view your real sales balance in the ledger.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-hairline-dark space-y-1.5 font-mono text-xs text-[#EDE8DD]/50">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>RS256 Verified JWT Tokens</span>
            </div>
            <div className="flex items-center gap-2 text-[#EDE8DD]/40">
              <Lock className="w-3.5 h-3.5" />
              <span>Bcrypt Cost-12 Hash Security</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
