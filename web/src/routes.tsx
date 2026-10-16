import { createBrowserRouter, Link, type RouteObject } from "react-router";
import { AppShell } from "./components/AppShell";
import { Empty, Panel } from "./components/ui";
import { AdminShell } from "./features/admin/AdminShell";
import { ConsolePage } from "./features/admin/ConsolePage";
import { ComposePage } from "./features/compose/ComposePage";
import { OverviewPage } from "./features/overview/OverviewPage";
import { ReportPage } from "./features/reports/ReportPage";
import { RulesetsPage } from "./features/rulesets/RulesetsPage";
import { SourcesPage } from "./features/sources/SourcesPage";
import { TradePage } from "./features/trades/TradePage";
import { TradesPage } from "./features/trades/TradesPage";

function NotFound() {
  return (
    <Panel>
      <Empty title="Page not found">
        That address doesn't match anything here. <Link to="/">Back to the overview</Link>.
      </Empty>
    </Panel>
  );
}

export const routes: RouteObject[] = [
  {
    path: "admin",
    element: <AdminShell />,
    children: [
      { index: true, element: <ConsolePage /> },
      { path: "rulesets/new", element: <ComposePage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "trades", element: <TradesPage /> },
      { path: "trades/:id", element: <TradePage /> },
      { path: "rulesets", element: <RulesetsPage /> },
      { path: "sources", element: <SourcesPage /> },
      { path: "reports", element: <ReportPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
