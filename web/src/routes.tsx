import { createBrowserRouter, Link, Outlet, type RouteObject } from "react-router";
import { AppShell } from "./components/AppShell";
import { Empty } from "./components/ui";
import { ThemeProvider } from "./lib/theme";
import { AdminShell } from "./features/admin/AdminShell";
import { AdminReportsPage } from "./features/admin/ReportsPage";
import { ConsolePage } from "./features/admin/ConsolePage";
import { ComposePage } from "./features/compose/ComposePage";
import { LandingPage } from "./features/landing/LandingPage";
import { OverviewPage } from "./features/overview/OverviewPage";
import { ReportPage } from "./features/reports/ReportPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { RulesetsPage } from "./features/rulesets/RulesetsPage";
import { SourcesPage } from "./features/sources/SourcesPage";
import { TradePage } from "./features/trades/TradePage";
import { TradesPage } from "./features/trades/TradesPage";

export const routes: RouteObject[] = [{
  element: <ThemeProvider><Outlet /></ThemeProvider>,
  children: [
    { index: true, element: <LandingPage /> },
    { path: "admin", element: <AdminShell />, children: [
      { index: true, element: <ConsolePage /> },
      { path: "rulesets/new", element: <ComposePage /> },
      { path: "reports", element: <AdminReportsPage /> },
    ] },
    { element: <AppShell />, children: [
      { path: "dashboard", element: <OverviewPage /> },
      { path: "trades", element: <TradesPage /> },
      { path: "trades/:id", element: <TradePage /> },
      { path: "rulesets", element: <RulesetsPage /> },
      { path: "sources", element: <SourcesPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "reports/:id", element: <ReportPage /> },
      { path: "*", element: <Empty title="Page not found">That address doesn't match anything here. <Link to="/">Back to the home page</Link>.</Empty> },
    ] },
  ],
}];

export const router = createBrowserRouter(routes);
