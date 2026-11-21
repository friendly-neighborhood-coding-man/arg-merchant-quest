/**
 * Times are formatted in one fixed zone. Letting the server (UTC) and the
 * browser (local) each choose produced different strings for the same row,
 * which is both confusing and a hydration mismatch.
 */
const TIME_ZONE = "UTC";

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}

/**
 * Korean demo times. Stored timestamps stay UTC ISO strings; this is display
 * only, for merchant/staff-facing screens where the shop's local clock matters.
 */
export function formatDateTimeKst(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
    timeZoneName: "short",
  }).format(date);
}

export function formatDateKst(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSeconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSeconds < 60) return "just now";
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatKrw(amount: number): string {
  return `₩${new Intl.NumberFormat("en-US").format(amount)}`;
}

export function rewardCopy(amount: number): string {
  return `${amount} test credits`;
}

export function couponWindowCopy(days: number): string {
  return days === 1 ? "valid 1 day after issue" : `valid ${days} days after issue`;
}

export function clueCount(count: number): string {
  return count === 1 ? "1 clue" : `${count} clues`;
}
