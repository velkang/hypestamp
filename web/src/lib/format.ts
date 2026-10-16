const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function shortHash(hash: string): string {
  return /^0x[0-9a-fA-F]{12,}$/.test(hash) ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

export function utcClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function utcClockSeconds(ms: number): string {
  return `${utcClock(ms)}:${pad(new Date(ms).getUTCSeconds())}`;
}

export function utcDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function usdFromE8(e8: string | null): string {
  return e8 === null ? "not filled" : usd.format(Number(BigInt(e8)) / 1e8);
}

export function tradeCode(id: number): string {
  return `T-${String(id).padStart(3, "0")}`;
}

export function signed(value: number): string {
  return `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}`;
}

export function relativeTime(ms: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}


export function periodLabel(period: { startDate: string; endDate: string }): string {
  const date = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`));
  const dates = period.startDate === period.endDate ? date(period.startDate) : `${date(period.startDate)} – ${date(period.endDate)}`;
  return `${dates} (UTC)`;
}
