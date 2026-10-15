// Layout of the commitment track: the cooldown segment (commit → refusals → in force)
// and the trading segment (trades → now), each on its own time scale, split by a break.
export type StopKind = "committed" | "refused" | "effective" | "trade" | "now";
export type Stop = { kind: StopKind; at: number; position: number; tradeId?: number; status?: string };

type TrackTrade = { id: number; submittedAt: number; status: string };
type TrackInput = { committedAt: number; effectiveFrom: number; trades: TrackTrade[]; now: number };

const MIN_GAP = 18; // percent of a segment, enough for a "HH:MM:SS" label pair
const END_GAP = 32; // the right-anchored end label ("now · unchanged") reaches further left

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (at: number, start: number, end: number) =>
  end <= start ? 100 : Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100));

// Push labels apart forwards, then pull them back from the fixed right edge.
function spread(stops: Stop[]): Stop[] {
  const out = stops.map((s) => ({ ...s }));
  const last = out.length - 1;
  const gapBefore = (i: number) => (i === last ? END_GAP : MIN_GAP);
  for (let i = 1; i < out.length; i++) out[i].position = Math.max(out[i].position, out[i - 1].position + gapBefore(i));
  out[last].position = 100;
  for (let i = last - 1; i >= 0; i--) out[i].position = Math.max(0, Math.min(out[i].position, out[i + 1].position - gapBefore(i + 1)));
  return out.map((s) => ({ ...s, position: round1(s.position) }));
}

export function buildTrack({ committedAt, effectiveFrom, trades, now }: TrackInput) {
  const effective = effectiveFrom * 1000;
  const sorted = [...trades].sort((a, b) => a.submittedAt - b.submittedAt);
  const refused = sorted.filter((t) => t.status === "failed" && t.submittedAt < effective);
  const traded = sorted.filter((t) => !(t.status === "failed" && t.submittedAt < effective));

  const before: Stop[] = [
    { kind: "committed", at: committedAt, position: 0 },
    ...refused.map((t) => ({ kind: "refused" as const, at: t.submittedAt, position: percent(t.submittedAt, committedAt, effective), tradeId: t.id, status: t.status })),
    { kind: "effective", at: effective, position: 100 },
  ];
  const after: Stop[] = [
    ...traded.map((t) => ({ kind: "trade" as const, at: t.submittedAt, position: percent(t.submittedAt, effective, now), tradeId: t.id, status: t.status })),
    { kind: "now", at: now, position: 100 },
  ];
  return { before: spread(before), after: spread(after) };
}
