import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../components/ui";
import { ApiError } from "../../lib/api";
import type { SavedReport } from "../../lib/types";
import { adminPost, useAdminSession } from "./session";

export function AdminReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const { token } = useAdminSession();
  const client = useQueryClient();
  const create = useMutation({ mutationFn: () => adminPost<SavedReport>(token, "/reports", { startDate, endDate }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["reports"] }) });
  const submit = (event: FormEvent) => { event.preventDefault(); if (!create.isPending) create.mutate(); };
  return <>
    <PageHeader title="Generate an evidence report">Choose the UTC dates when trades were opened. Generation saves a publicly readable snapshot of their evidence and outcomes known now.</PageHeader>
    <form className="report-form" onSubmit={submit}>
      <label className="field">Start date (UTC)<input type="date" required max={endDate || today} value={startDate} onChange={(e) => { setStart(e.target.value); create.reset(); }} /></label>
      <label className="field">End date (UTC)<input type="date" required min={startDate} max={today} value={endDate} onChange={(e) => { setEnd(e.target.value); create.reset(); }} /></label>
      <button type="submit" className="primary-button" disabled={!startDate || !endDate || startDate > endDate || create.isPending}>{create.isPending ? "Generating…" : "Generate report"}</button>
    </form>
    <p className="quiet-note">Both dates are included. Selecting today creates a partial-period snapshot. Saved reports are immutable and appear in the public report history.</p>
    {create.isError && <p role="alert" className="text-bear-ink">{create.error instanceof ApiError ? create.error.message : "The report could not be generated. Try again."}</p>}
    {create.data && <p role="status">Report saved. <Link to={`/reports/${create.data.id}`}>Read the saved report →</Link></p>}
    <section><h2 className="section-title">Daily reports</h2><p>Daily generation starts after 00:10 UTC for the previous day. Failed generations retry on later five-minute ticks; missed days are caught up one at a time.</p><Link to="/reports">View report history →</Link></section>
  </>;
}
