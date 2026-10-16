import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { getJson, postJson } from "../../lib/api";
import type { AdminOverview } from "../../lib/types";

const TOKEN_KEY = "hypestamp.ownerToken";
const read = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const write = (token: string) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked: the token lives in memory for this page only */ }
};

type Session = { token: string; unlock: (token: string) => void; lock: () => void };
const SessionContext = createContext<Session | null>(null);

// The owner token is kept for this browser tab only and sent as a bearer on admin calls.
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(read);
  const unlock = (next: string) => { write(next); setToken(next); };
  const lock = () => { write(""); setToken(""); };
  return <SessionContext.Provider value={{ token, unlock, lock }}>{children}</SessionContext.Provider>;
}

export function useAdminSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useAdminSession must be used inside AdminSessionProvider");
  return session;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export function useAdminOverview(pollMs = 30_000) {
  const { token } = useAdminSession();
  return useQuery({
    queryKey: ["admin", "overview", token],
    queryFn: () => getJson<AdminOverview>("/v1/admin/overview", bearer(token)),
    enabled: Boolean(token),
    refetchInterval: pollMs,
  });
}

export function adminPost<T>(token: string, path: string, body: unknown): Promise<T> {
  return postJson<T>(`/v1/admin${path}`, body, bearer(token));
}
