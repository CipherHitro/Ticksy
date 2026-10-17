import CircuitBreaker from 'opossum';
import type { UpstreamService } from '../config/upstreams.js';
import { ALL_UPSTREAMS } from '../config/upstreams.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface BreakerStatus {
  state: 'open' | 'half-open' | 'closed';
  stats: {
    failures: number;
    fallbacks: number;
    successes: number;
    rejects: number;
    fires: number;
    timeouts: number;
  };
}

const breakers = new Map<UpstreamService, CircuitBreaker>();

function createBreaker(serviceName: UpstreamService): CircuitBreaker {
  const breaker = new CircuitBreaker(
    async <T>(action: () => Promise<T>): Promise<T> => {
      return await action();
    },
    {
      timeout: env.UPSTREAM_TIMEOUT_MS,
      errorThresholdPercentage: 50,
      rollingCountTimeout: 10000,
      volumeThreshold: 10,
      resetTimeout: 10000,
      errorFilter: (err: any) => {
        // Return true to NOT count as a failure:
        // Client errors (4xx) are NOT upstream service failures.
        if (err && typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
          return true;
        }
        return false;
      },
    }
  );

  breaker.on('open', () => {
    logger.warn({ upstream: serviceName }, `[CircuitBreaker] Breaker tripped OPEN for upstream: ${serviceName}`);
  });

  breaker.on('halfOpen', () => {
    logger.info({ upstream: serviceName }, `[CircuitBreaker] Breaker is HALF-OPEN for upstream: ${serviceName}`);
  });

  breaker.on('close', () => {
    logger.info({ upstream: serviceName }, `[CircuitBreaker] Breaker is CLOSED (healthy) for upstream: ${serviceName}`);
  });

  return breaker;
}

// Initialize breakers for all known upstreams
for (const upstream of ALL_UPSTREAMS) {
  breakers.set(upstream, createBreaker(upstream));
}

export function getBreaker(service: UpstreamService): CircuitBreaker {
  let breaker = breakers.get(service);
  if (!breaker) {
    breaker = createBreaker(service);
    breakers.set(service, breaker);
  }
  return breaker;
}

export function getAllBreakersStatus(): Record<UpstreamService, BreakerStatus> {
  const statusRecord: Partial<Record<UpstreamService, BreakerStatus>> = {};

  for (const [service, breaker] of breakers.entries()) {
    const state: 'open' | 'half-open' | 'closed' = breaker.opened
      ? 'open'
      : breaker.halfOpen
        ? 'half-open'
        : 'closed';

    const stats = breaker.stats;
    statusRecord[service] = {
      state,
      stats: {
        failures: stats.failures,
        fallbacks: stats.fallbacks,
        successes: stats.successes,
        rejects: stats.rejects,
        fires: stats.fires,
        timeouts: stats.timeouts,
      },
    };
  }

  return statusRecord as Record<UpstreamService, BreakerStatus>;
}
