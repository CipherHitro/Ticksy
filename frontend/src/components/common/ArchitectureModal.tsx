import React, { useState, useEffect } from 'react';
import { checkMicroserviceHealth } from '../../services/api';
import { X, Server, Database, RefreshCw } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [health, setHealth] = useState<{
    gateway: boolean;
    auth: boolean;
    booking: boolean;
    ledger: boolean;
    payment: boolean;
    notification: boolean;
  }>({
    gateway: false,
    auth: false,
    booking: false,
    ledger: false,
    payment: false,
    notification: false,
  });
  const [checking, setChecking] = useState(false);

  const runHealthCheck = async () => {
    setChecking(true);
    const res = await checkMicroserviceHealth();
    setHealth(res);
    setChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      runHealthCheck();
    }
  }, [isOpen]);

  if (!isOpen) return null;


  const services = [
    {
      name: 'API Gateway',
      port: 8080,
      stack: 'TypeScript, Node.js, Express',
      db: 'Redis (Rate Limiting)',
      role: 'Single public entrypoint, RS256 verification, path routing',
      live: health.gateway,
      prefix: '/api/v1/*',
    },
    {
      name: 'Auth Service',
      port: 4001,
      stack: 'TypeScript, Express, Prisma',
      db: 'PostgreSQL 16 (Port 5433)',
      role: 'RS256 token minting, JWKS (/.well-known/jwks.json), hashed refresh cookies',
      live: health.auth,
      prefix: '/api/v1/auth',
    },
    {
      name: 'Payment Service',
      port: 4004,
      stack: 'C# 13, .NET 10 Minimal APIs',
      db: 'PostgreSQL 16 (Port 5434)',
      role: 'Razorpay orders, webhook signature verification, Transactional Outbox',
      live: health.payment,
      prefix: '/api/v1/payments',
    },
    {
      name: 'Ledger Service',
      port: 4005,
      stack: 'C# 13, .NET 10 Minimal APIs',
      db: 'KurrentDB (2113) + Redis (6381)',
      role: 'Event Sourcing, immutable append-only streams, CQRS Redis projections',
      live: health.ledger,
      prefix: '/api/v1/ledger',
    },
    {
      name: 'Notification Service',
      port: 4006,
      stack: 'PHP 8.3, Laravel 11',
      db: 'Redis (Token Bucket) + RabbitMQ',
      role: 'Async event consumer, Resend transactional emails, webhook delivery tracking',
      live: health.notification,
      prefix: '/api/v1/notifications',
    },
    {
      name: 'Catalog Service',
      port: 4002,
      stack: 'Python 3.12, FastAPI, GraphQL',
      db: 'MongoDB Replica Set',
      role: 'Event catalog, tier specs, GraphQL queries & gRPC server (50052)',
      live: false,
      planned: true,
      prefix: '/api/v1/catalog',
    },
    {
      name: 'Booking Service',
      port: 4003,
      stack: 'Java 21, Spring Boot 3.3.5',
      db: 'MySQL 8 (3307) + Redis (6380)',
      role: 'Distributed seat hold locks, transactional outbox & MySQL row concurrency',
      live: health.booking,
      prefix: '/api/v1/bookings',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0B0A08] text-[#EDE8DD] rounded-[3px] border border-hairline-dark shadow-2xl p-6 sm:p-8 my-8 paper-grain">
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
            <div className="font-mono text-xs uppercase tracking-widest text-[#FF4F1F] font-bold mb-1">
              POLYGLOT SYSTEM TOPOLOGY
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-[#EDE8DD]">
              Ticksy Microservices Architecture
            </h2>
            <p className="font-sans text-xs text-[#EDE8DD]/60 mt-1">
              Demonstrating 5 distinct languages, database-per-service, RS256 JWKS auth, event sourcing, and CQRS.
            </p>
          </div>

          <button
            onClick={runHealthCheck}
            disabled={checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 font-mono text-xs rounded-[2px] border border-hairline-dark transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Ping Endpoints</span>
          </button>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="p-5 bg-[#12100D] border border-hairline-dark rounded-[2px] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-serif text-xl text-[#EDE8DD] font-semibold">
                    {svc.name}
                  </div>
                  {svc.planned ? (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-[2px] bg-[#EDE8DD]/10 text-[#EDE8DD]/60">
                      SPECS DEFINED
                    </span>
                  ) : svc.live ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-[2px] bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      HTTP 200 READY
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-[2px] bg-amber-950/40 border border-amber-500/30 text-amber-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      SIMULATED / DEV FALLBACK
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 font-mono text-xs text-[#EDE8DD]/70 mb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-[#FF4F1F]" />
                    <span className="text-[#EDE8DD]">{svc.stack}</span>
                    <span className="text-[#EDE8DD]/40">· Port {svc.port}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-[#B8975A]" />
                    <span>{svc.db}</span>
                  </div>
                </div>

                <p className="font-sans text-xs text-[#EDE8DD]/60 leading-relaxed">
                  {svc.role}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-hairline-dark flex justify-between font-mono text-[10px] text-[#EDE8DD]/50">
                <span>ROUTE: {svc.prefix}</span>
                <span>STATUS: ACTIVE</span>
              </div>
            </div>
          ))}
        </div>

        {/* Architectural Principles Callout */}
        <div className="p-4 bg-[#14120E] border border-hairline-dark rounded-[2px] font-mono text-xs text-[#EDE8DD]/70 space-y-1">
          <div className="text-[#EDE8DD] font-bold">COURSE & SPECIFICATION GUARANTEES:</div>
          <div className="text-[11px] text-[#EDE8DD]/50">
            • Asymmetric Auth: Private RSA key strictly held in Auth; Gateway and services verify via public JWKS.
            <br />
            • Financial Minor Units: All currency calculated and stored strictly in paise (minor units), never floating-point.
            <br />
            • Event Sourcing: Ledger updates are append-only KurrentDB events; statements are fast CQRS Redis projections.
          </div>
        </div>
      </div>
    </div>
  );
};
