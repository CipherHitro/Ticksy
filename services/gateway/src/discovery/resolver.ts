import { env } from '../config/env.js';
import type { UpstreamService } from '../config/upstreams.js';

const upstreamOverrides = new Map<UpstreamService, string>();

export function setUpstreamOverride(service: UpstreamService, url: string | null): void {
  if (url === null) {
    upstreamOverrides.delete(service);
  } else {
    upstreamOverrides.set(service, url);
  }
}

export function resolveUpstream(service: UpstreamService): string {
  const override = upstreamOverrides.get(service);
  if (override) {
    return override;
  }

  switch (service) {
    case 'auth':
      return env.AUTH_URL;
    case 'catalog':
      return env.CATALOG_URL;
    case 'booking':
      return env.BOOKING_URL;
    case 'payment':
      return env.PAYMENT_URL;
    case 'ledger':
      return env.LEDGER_URL;
    default:
      throw new Error(`Unknown upstream service: ${service}`);
  }
}

