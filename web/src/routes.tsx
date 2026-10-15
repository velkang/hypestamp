import { createBrowserRouter, Link, type RouteObject } from "react-router";
import { AppShell } from "./components/AppShell";
import { Empty, Panel } from "./components/ui";
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
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "trades", element: <TradesPage /> },
      { path: "trades/:id", element: <TradePage /> },
      { path: "rulesets/new", element: <ComposePage /> },
      { path: "rulesets", element: <RulesetsPage /> },
      { path: "sources", element: <SourcesPage /> },
      { path: "reports", element: <ReportPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
