/**
 * Indian Rupee formatting with Indian digit grouping (lakhs, crores).
 * Expects integer minor units (paise). 100 paise = ₹1.
 */
export function formatINR(minorUnits: number): string {
  const rupees = Math.round(minorUnits / 100);
  const isNegative = rupees < 0;
  const abs = Math.abs(rupees).toString();

  // Indian digit grouping: last 3 digits, then groups of 2
  let result = '';
  if (abs.length <= 3) {
    result = abs;
  } else {
    const lastThree = abs.slice(-3);
    const rest = abs.slice(0, -3);
    const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    result = `${withCommas},${lastThree}`;
  }

  return `${isNegative ? '−' : ''}₹${result}`;
}

/**
 * Format raw rupees (integer) to Indian format
 */
export function formatRawRupees(rupees: number): string {
  return formatINR(rupees * 100);
}

/**
 * Seconds to mm:ss countdown display
 */
export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate a ticket serial number in Ticksy format: TKS-xxxx-xxx
 */
export function generateTicketSerial(seed?: string): string {
  if (seed) {
    const clean = seed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return `TKS-${clean.slice(0, 4)}-${clean.slice(4, 7) || 'X01'}`;
  }
  const part1 = Math.floor(1000 + Math.random() * 9000);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const part2 = letters[Math.floor(Math.random() * letters.length)] +
                Math.floor(10 + Math.random() * 90);
  return `TKS-${part1}-${part2}`;
}

/**
 * Format ISO date string to editorial date
 */
export function formatEventDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
