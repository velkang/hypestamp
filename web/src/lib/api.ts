import { useQuery } from "@tanstack/react-query";
import type { ComplianceReport, ReportSummary, SavedReport, Feed, Replay, RulesetDetail, RulesetSummary, Status, Trade } from "./types";

type Envelope<T> = { success: true; data: T } | { success: false; error: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json", ...headers } });
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !body || !body.success) {
    throw new ApiError(response.status, body && !body.success ? body.error : `Request failed (${response.status})`);
  }
  return body.data;
}

export async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !parsed || !parsed.success) {
    throw new ApiError(response.status, parsed && !parsed.success ? parsed.error : `Request failed (${response.status})`);
  }
  return parsed.data;
}

const MINUTE = 60_000;

export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: () => getJson<Status>("/v1/status"), refetchInterval: MINUTE });
export const useFeed = () => useQuery({ queryKey: ["feed"], queryFn: () => getJson<Feed>("/v1/feed"), refetchInterval: MINUTE });
export const useTrades = () => useQuery({ queryKey: ["trades"], queryFn: () => getJson<Trade[]>("/v1/trades"), refetchInterval: MINUTE });
export const useTrade = (id: number) => useQuery({ queryKey: ["trade", id], queryFn: () => getJson<Trade>(`/v1/trades/${id}`), refetchInterval: MINUTE });
export const useReplay = (id: number) =>
  useQuery({ queryKey: ["replay", id], queryFn: () => getJson<Replay>(`/v1/trades/${id}/replay`), refetchInterval: MINUTE });
export const useRulesets = () => useQuery({ queryKey: ["rulesets"], queryFn: () => getJson<RulesetSummary[]>("/v1/rulesets") });
export const useRuleset = (hash: string | undefined) =>
  useQuery({
    queryKey: ["ruleset", hash],
    queryFn: () => getJson<RulesetDetail>(`/v1/rulesets/${hash}`),
    enabled: Boolean(hash),
  });
export const useReport = () =>
  useQuery({ queryKey: ["report"], queryFn: () => getJson<ComplianceReport>("/v1/reports/compliance") });

export const useReports = () => useQuery({ queryKey: ["reports"], queryFn: () => getJson<ReportSummary[]>("/v1/reports"), refetchInterval: MINUTE });
export const useSavedReport = (id: string) => useQuery({ queryKey: ["reports", id], queryFn: () => getJson<SavedReport>(`/v1/reports/${encodeURIComponent(id)}`), staleTime: Infinity });
