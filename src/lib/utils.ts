import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
  parseISO,
} from "date-fns";

export function formatCurrency(amount: number, currency: string = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd MMM yyyy");
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd MMM");
}

export type Period = "daily" | "weekly" | "monthly";

export function getDateRange(period: Period, offset: number = 0) {
  const now = new Date();

  switch (period) {
    case "daily": {
      const day = subDays(now, offset);
      return {
        from: format(day, "yyyy-MM-dd"),
        to: format(day, "yyyy-MM-dd"),
        label: format(day, "EEE dd MMM yyyy"),
      };
    }
    case "weekly": {
      const weekStart = startOfWeek(subWeeks(now, offset), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(now, offset), { weekStartsOn: 1 });
      return {
        from: format(weekStart, "yyyy-MM-dd"),
        to: format(weekEnd, "yyyy-MM-dd"),
        label: `${format(weekStart, "dd MMM")} - ${format(weekEnd, "dd MMM yyyy")}`,
      };
    }
    case "monthly": {
      const monthDate = subMonths(now, offset);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      return {
        from: format(monthStart, "yyyy-MM-dd"),
        to: format(monthEnd, "yyyy-MM-dd"),
        label: format(monthDate, "MMMM yyyy"),
      };
    }
  }
}

export function getMerchantName(tx: {
  creditorName?: string | null;
  debtorName?: string | null;
  merchantName?: string | null;
  remittanceInfo?: string | null;
}): string {
  return (
    tx.merchantName ||
    tx.creditorName ||
    tx.debtorName ||
    tx.remittanceInfo?.slice(0, 40) ||
    "Unknown"
  );
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Derive a sensible search pattern from a merchant/transaction name.
 *
 * Bank transaction descriptions are noisy:
 *   "TESCO STORES 6732 LONDON GB"  →  "tesco stores"
 *   "AMAZON.CO.UK*A1B2C3D4E"       →  "amazon.co.uk"
 *   "DELIVEROO.COM  0742831"       →  "deliveroo.com"
 *   "TFL TRAVEL CH  TFL.GOV.UK"    →  "tfl travel"
 *   "UBER *EATS"                   →  "uber eats"
 *
 * Strategy:
 *  1. Lowercase
 *  2. Replace common separators (*  /  \  |) with spaces
 *  3. Strip trailing reference numbers, dates, card suffixes
 *  4. Strip common noise words that are location/payment metadata
 *  5. Collapse whitespace and trim
 *  6. Take the first meaningful token(s) – usually the merchant brand
 */
export function derivePattern(raw: string): string {
  let s = raw.toLowerCase();

  // Replace separators with space
  s = s.replace(/[*|/\\]/g, " ");

  // Remove anything after common card / reference markers
  s = s.replace(/\b(visa|mastercard|debit|credit|card)\b.*$/i, "");

  // Remove long hex/alphanumeric reference codes (5+ chars of mixed letters & digits)
  s = s.replace(/\b[a-z0-9]{5,}\d[a-z0-9]*\b/g, "");
  s = s.replace(/\b\d[a-z0-9]{5,}\b/g, "");

  // Remove pure numbers (branch codes, store IDs, dates etc)
  s = s.replace(/\b\d+\b/g, "");

  // Remove common noise suffixes
  const noiseWords = [
    "ltd", "limited", "plc", "inc", "uk", "gb", "co", "com",
    "www", "http", "https", "the", "and",
  ];
  const words = s.trim().split(/\s+/).filter((w) => w.length > 0);
  const cleaned = words.filter(
    (w) => !noiseWords.includes(w.replace(/[^a-z]/g, ""))
  );

  // Take up to the first 3 meaningful words (usually enough to identify the merchant)
  const pattern = cleaned.slice(0, 3).join(" ").trim();

  // If we ended up with nothing useful, fall back to the first recognisable chunk
  if (pattern.length < 2) {
    const fallback = raw.toLowerCase().replace(/[^a-z.]/g, " ").trim().split(/\s+/)[0];
    return fallback || raw.toLowerCase().slice(0, 20);
  }

  return pattern;
}
